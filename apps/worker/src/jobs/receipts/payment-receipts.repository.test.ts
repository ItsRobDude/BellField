import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { QueryExecutor } from '../../common/database';
import { PaymentReceiptsRepository } from './payment-receipts.repository';

class CapturingDatabase implements QueryExecutor {
  queries: Array<{ text: string; values: unknown[] }> = [];

  async query(text: string, values: unknown[] = []) {
    this.queries.push({ text, values });
    return {
      rows: [
        {
          id: 'receipt-1',
          kind: 'paymentReceipt',
          job_id: 'job-1',
          amount: '100.00',
          currency: 'USD',
          method: 'check',
          purpose: 'deposit',
          occurred_at: new Date('2026-06-16T12:00:00.000Z'),
          attempt_count: 0,
          recipient_email: null,
          subject: null,
          body_text: null
        }
      ],
      rowCount: 1
    } as never;
  }
}

test('PaymentReceiptsRepository claimDueQueued claims both payment and refund receipts', async () => {
  const database = new CapturingDatabase();
  const repository = new PaymentReceiptsRepository(database);

  const claimed = await repository.claimDueQueued(new Date('2026-06-16T12:00:00.000Z'), 5);

  assert.equal(claimed.length, 1);
  assert.equal(claimed[0]?.kind, 'paymentReceipt');
  // Both receipt kinds are claimable now (refund receipts shipped in slice 2a).
  assert.match(
    database.queries[0]?.text ?? '',
    /and prm\.kind in \('paymentReceipt', 'refundReceipt'\)/
  );
});
