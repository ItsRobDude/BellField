import { ConflictException, NotFoundException } from '@nestjs/common';
import type { JobStatus } from '@bellfield/contracts';
import type { QueryExecutor } from '../../database/database.service';
import { isFinalJobStatus, REOPEN_FOR_COST_WRITE_MESSAGE } from './company-data.types';

/**
 * Lock the job row inside an already-open transaction and reject a cost-impacting write when the
 * job is final (completed/closed/cancelled), or report not-found when it is missing.
 *
 * Run this as the first statement of every cost-write transaction — job-costing labor/expense/
 * reversal, inventory issue-to-job, and PO receive-to-job. It takes the same `for update` lock on
 * the `jobs` row that the completion path takes when it freezes the finalized cost snapshot
 * (see jobs-data.repository). That makes the status check and the write atomic: a concurrent
 * completion either commits first (so this `select` then sees the final status and aborts the
 * write) or waits behind this lock (so the write commits before the snapshot is taken). Without
 * the lock, a service-level pre-check can pass and the write can still land after the snapshot is
 * frozen, drifting live cost away from the finalized figure.
 *
 * The matching service-level pre-check stays in place purely as a fast, friendly early rejection;
 * this is the authoritative guard.
 */
export async function lockJobForCostWrite(queryable: QueryExecutor, jobId: string): Promise<void> {
  const result = await queryable.query<{ status: JobStatus }>(
    `select status from jobs where id = $1 for update`,
    [jobId]
  );
  const status = result.rows[0]?.status ?? null;
  if (status === null) {
    throw new NotFoundException('Job not found.');
  }
  if (isFinalJobStatus(status)) {
    throw new ConflictException(REOPEN_FOR_COST_WRITE_MESSAGE);
  }
}
