import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { QueryResult, QueryResultRow } from 'pg';
import type { QueryExecutor, TransactionalQueryExecutor } from '../../common/database';
import { DeliveryRepository } from './delivery.repository';

class CapturingDatabase implements TransactionalQueryExecutor {
  queries: Array<{ text: string; values?: unknown[] }> = [];
  rows: QueryResultRow[] = [];
  rowQueue: QueryResultRow[][] = [];

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[]
  ): Promise<QueryResult<T>> {
    this.queries.push({ text, values });
    const rows = this.rowQueue.length > 0 ? (this.rowQueue.shift() ?? []) : this.rows;
    return {
      command: 'UPDATE',
      rowCount: rows.length,
      oid: 0,
      fields: [],
      rows: rows as T[]
    };
  }

  async transaction<T>(callback: (queryable: QueryExecutor) => Promise<T>): Promise<T> {
    return await callback(this);
  }
}

test('DeliveryRepository claimDueQueued leases due rows with skip-locked semantics', async () => {
  const database = new CapturingDatabase();
  database.rows = [
    {
      id: 'msg-1',
      job_id: 'job-1',
      recipient_email: 'homeowner@example.com',
      subject: 'Your estimate',
      body_text: 'Estimate attached.',
      from_name: 'Acme HVAC',
      reply_to_email: 'office@acme.example',
      sent_by_name: 'Dispatcher',
      attempt_count: 1,
      expires_at: new Date('2026-06-12T00:00:00Z'),
      acceptance_payload: {
        estimateRef: 'estimate-1',
        estimateVersion: 2,
        title: 'AC replacement',
        options: [{ id: 'opt-1', label: 'Repair', totalCents: 84_500 }]
      },
      storage_path: 'customer-documents/jobs/job-1/estimate.pdf',
      sha256: 'a'.repeat(64),
      filename: 'estimate.pdf',
      document_type: 'estimate',
      document_title: 'AC replacement'
    }
  ];
  const repository = new DeliveryRepository(database);
  const now = new Date('2026-06-11T12:00:00Z');

  const claimed = await repository.claimDueQueued(now, 10);

  assert.equal(database.queries.length, 1);
  const query = database.queries[0];
  assert.match(query.text, /update outbound_messages claimed/i);
  assert.match(query.text, /for update skip locked/i);
  assert.deepEqual(query.values, [now, 10, new Date('2026-06-11T12:10:00Z')]);
  assert.deepEqual(claimed, [
    {
      id: 'msg-1',
      jobId: 'job-1',
      recipientEmail: 'homeowner@example.com',
      subject: 'Your estimate',
      bodyText: 'Estimate attached.',
      fromName: 'Acme HVAC',
      replyToEmail: 'office@acme.example',
      sentByName: 'Dispatcher',
      attemptCount: 1,
      expiresAt: new Date('2026-06-12T00:00:00Z'),
      documentType: 'estimate',
      documentTitle: 'AC replacement',
      snapshotStoragePath: 'customer-documents/jobs/job-1/estimate.pdf',
      snapshotSha256: 'a'.repeat(64),
      snapshotFilename: 'estimate.pdf',
      acceptancePayload: {
        estimateRef: 'estimate-1',
        estimateVersion: 2,
        title: 'AC replacement',
        options: [{ id: 'opt-1', label: 'Repair', totalCents: 84_500 }]
      }
    }
  ]);
});

test('DeliveryRepository stores fixed decline reason codes when applying a customer decline', async () => {
  const database = new CapturingDatabase();
  database.rowQueue = [
    [{ id: 'message-1', acceptance_decision_applied_at: null }],
    [
      {
        id: 'estimate-1',
        job_id: 'job-1',
        title: 'AC replacement',
        status: 'pending',
        version: 2,
        option_groups: null
      }
    ]
  ];
  const repository = new DeliveryRepository(database);
  const occurredAt = new Date('2026-06-12T18:00:00Z');

  const outcome = await repository.applyAcceptanceDecision(
    {
      acceptanceLinkId: 'link-1',
      estimateRef: 'estimate-1',
      estimateVersion: 2,
      decision: 'declined',
      selectedOptionId: null,
      declineReasons: ['price', 'questions', 'not-a-code'],
      note: 'Please call me.',
      decidedAt: occurredAt.toISOString()
    },
    occurredAt
  );

  assert.equal(outcome, 'applied');
  const estimateUpdate = database.queries.find((query) =>
    /set status = 'declined'/i.test(query.text)
  );
  assert.equal(estimateUpdate?.values?.[2], JSON.stringify(['price', 'questions']));
  const timelineInsert = database.queries.find((query) =>
    /insert into job_timeline_entries/i.test(query.text)
  );
  assert.match(
    String(timelineInsert?.values?.[4]),
    /Reasons: Price, Has questions first\. Customer note: Please call me\./
  );
});
