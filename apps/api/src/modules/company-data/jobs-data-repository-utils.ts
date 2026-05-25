import type { QueryExecutor } from '../../database/database.service';
import type { JobTimelineEntry } from './company-data.types';

export type TimelineInsertRow = {
  id: string;
  jobId: string;
  occurredAt: string | Date;
  actorName: string;
  kind: JobTimelineEntry['kind'];
  message: string;
};

export async function insertJobTimelineEntry(
  entry: TimelineInsertRow,
  queryable: QueryExecutor
): Promise<void> {
  await queryable.query(
    `
      insert into job_timeline_entries (id, job_id, occurred_at, actor_name, kind, message)
      values ($1, $2, $3, $4, $5, $6)
    `,
    [entry.id, entry.jobId, entry.occurredAt, entry.actorName, entry.kind, entry.message]
  );
}

export function buildRegisterEntryVoidedMessage(
  description: string,
  reason: string | null
): string {
  if (!reason) {
    return `Register entry voided: ${description}.`;
  }

  return `Register entry voided: ${description}. Reason: ${reason}${reason.endsWith('.') ? '' : '.'}`;
}

export function buildMediaCaptionMessage(filename: string, caption: string | null): string {
  if (!caption) {
    return `Caption cleared on ${filename}.`;
  }
  return `Caption updated on ${filename}: ${caption}`;
}

export function buildMediaVoidedMessage(filename: string, reason: string | null): string {
  if (reason) {
    return `${filename} voided (reason: ${reason}).`;
  }
  return `${filename} voided.`;
}
