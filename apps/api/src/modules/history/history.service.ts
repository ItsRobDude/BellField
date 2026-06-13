import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  HistoryEntry,
  HistoryQuery,
  HistoryRecordType,
  HistoryResponse
} from '@bellfield/contracts';
import { DatabaseService } from '../../database/database.service';
import { toIsoString } from '../../database/database-row.utils';
import { IdentityAccessService } from '../identity-access/identity-access.service';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * Read-only union over existing timelines/ledgers, projected to a common shape:
 *   record_type, source_id, occurred_at, actor_employee_id, actor_name, detail, job_id
 * Payments carry their job directly; equipment history is equipment-scoped and carries no job.
 * `detail` is the most descriptive single field per source; the human summary is built from it
 * in TypeScript.
 */
const HISTORY_UNION_SQL = `
  select 'jobTimeline' as record_type, id as source_id, occurred_at, null::text as actor_employee_id,
         actor_name, message as detail, job_id
    from job_timeline_entries
  union all
  select 'registerEntry', id, captured_at, captured_by_employee_id, captured_by_name, description, job_id
    from register_entries
  union all
  select 'inventoryMovement', id, occurred_at, actor_employee_id, actor_name, kind, job_id
    from inventory_movements
  union all
  select 'jobCostEvent', id, occurred_at, actor_employee_id, actor_name, description, job_id
    from job_cost_events
  union all
  select 'payment', p.id, p.received_at, p.recorded_by_employee_id, p.recorded_by_name, p.method, p.job_id
    from payments p
  union all
  select 'equipmentHistory', id, occurred_at, null::text, actor_name, message, null::text
    from equipment_history_entries
`;

type HistoryRow = {
  recordType: HistoryRecordType;
  sourceId: string;
  occurredAt: string | Date;
  actorEmployeeId: string | null;
  actorName: string | null;
  detail: string;
  jobId: string | null;
};

const HISTORY_RECORD_TYPES = new Set<HistoryRecordType>([
  'jobTimeline',
  'registerEntry',
  'inventoryMovement',
  'jobCostEvent',
  'payment',
  'equipmentHistory'
]);

type Cursor = { o: string; r: HistoryRecordType; s: string };

function buildSummary(recordType: HistoryRecordType, detail: string): string {
  switch (recordType) {
    case 'jobTimeline':
      return detail;
    case 'registerEntry':
      return `Register entry: ${detail}`;
    case 'inventoryMovement':
      return `Inventory movement: ${detail}`;
    case 'jobCostEvent':
      return `Job cost: ${detail}`;
    case 'payment':
      return `Payment recorded (${detail})`;
    case 'equipmentHistory':
      return detail;
  }
}

function encodeCursor(row: HistoryRow): string {
  const payload: Cursor = { o: toIsoString(row.occurredAt), r: row.recordType, s: row.sourceId };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

// Reject a malformed cursor rather than silently serving the first page (matches the job-queue
// cursor contract). A tampered or stale-format cursor is a client error, not "start over".
function decodeCursor(cursor: string): Cursor {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Partial<Cursor>;
    if (
      typeof parsed.o !== 'string' ||
      Number.isNaN(new Date(parsed.o).getTime()) ||
      typeof parsed.r !== 'string' ||
      !HISTORY_RECORD_TYPES.has(parsed.r as HistoryRecordType) ||
      typeof parsed.s !== 'string' ||
      parsed.s.trim().length === 0
    ) {
      throw new Error('Invalid cursor payload.');
    }
    return { o: parsed.o, r: parsed.r as HistoryRecordType, s: parsed.s };
  } catch {
    throw new BadRequestException('History cursor is invalid.');
  }
}

@Injectable()
export class HistoryService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly identityAccessService: IdentityAccessService
  ) {}

  async getHistory(sessionToken: string, query: HistoryQuery): Promise<HistoryResponse> {
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'history:view', [
      'office-web'
    ]);

    const limit = Math.min(Math.max(query.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const params: unknown[] = [];
    const clauses: string[] = [];
    const add = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };

    if (query.dateFrom) {
      clauses.push(`h.occurred_at >= ${add(query.dateFrom)}::timestamptz`);
    }
    if (query.dateTo) {
      clauses.push(`h.occurred_at <= ${add(query.dateTo)}::timestamptz`);
    }
    if (query.actorEmployeeId) {
      clauses.push(`h.actor_employee_id = ${add(query.actorEmployeeId)}`);
    }
    if (query.recordType) {
      clauses.push(`h.record_type = ${add(query.recordType)}`);
    }
    if (query.jobId) {
      clauses.push(`h.job_id = ${add(query.jobId)}`);
    }

    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    if (cursor) {
      // Keyset for the ordering (occurred_at DESC, record_type ASC, source_id DESC).
      const o = add(cursor.o);
      const r = add(cursor.r);
      const s = add(cursor.s);
      clauses.push(
        `(h.occurred_at < ${o}::timestamptz` +
          ` or (h.occurred_at = ${o}::timestamptz and h.record_type > ${r})` +
          ` or (h.occurred_at = ${o}::timestamptz and h.record_type = ${r} and h.source_id < ${s}))`
      );
    }

    const whereSql = clauses.length > 0 ? `where ${clauses.join(' and ')}` : '';
    const limitPlaceholder = add(limit + 1); // fetch one extra to detect a next page

    const sql = `
      select record_type as "recordType", source_id as "sourceId", occurred_at as "occurredAt",
             actor_employee_id as "actorEmployeeId", actor_name as "actorName", detail,
             job_id as "jobId"
      from (${HISTORY_UNION_SQL}) h
      ${whereSql}
      order by h.occurred_at desc, h.record_type asc, h.source_id desc
      limit ${limitPlaceholder}
    `;

    const result = await this.databaseService.query<HistoryRow>(sql, params);
    const hasMore = result.rows.length > limit;
    const page = hasMore ? result.rows.slice(0, limit) : result.rows;

    const entries: HistoryEntry[] = page.map((row) => ({
      recordType: row.recordType,
      sourceId: row.sourceId,
      occurredAt: toIsoString(row.occurredAt),
      actorEmployeeId: row.actorEmployeeId,
      actorName: row.actorName,
      summary: buildSummary(row.recordType, row.detail),
      jobId: row.jobId
    }));

    return {
      entries,
      nextCursor: hasMore && page.length > 0 ? encodeCursor(page[page.length - 1]) : null
    };
  }
}
