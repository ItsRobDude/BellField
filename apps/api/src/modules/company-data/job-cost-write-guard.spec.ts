import { ConflictException, NotFoundException } from '@nestjs/common';
import type { QueryExecutor } from '../../database/database.service';
import { lockJobForCostWrite } from './job-cost-write-guard';
import { REOPEN_FOR_COST_WRITE_MESSAGE } from './company-data.types';

function queryableReturning(rows: unknown[]) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const queryable: QueryExecutor = {
    query: (async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return { rows, rowCount: rows.length };
    }) as QueryExecutor['query']
  };
  return { queryable, calls };
}

describe('lockJobForCostWrite', () => {
  it('locks the job row with a for-update select on the given job id', async () => {
    const { queryable, calls } = queryableReturning([{ status: 'inProgress' }]);

    await lockJobForCostWrite(queryable, 'job-1');

    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toMatch(/from jobs where id = \$1\s+for update/i);
    expect(calls[0].params).toEqual(['job-1']);
  });

  it('resolves for every open status', async () => {
    for (const status of ['new', 'scheduled', 'inProgress', 'waitingOnParts']) {
      const { queryable } = queryableReturning([{ status }]);
      await expect(lockJobForCostWrite(queryable, 'job-1')).resolves.toBeUndefined();
    }
  });

  it('rejects a final job with the reopen-to-revise message', async () => {
    for (const status of ['completed', 'closed', 'cancelled']) {
      const { queryable } = queryableReturning([{ status }]);
      await expect(lockJobForCostWrite(queryable, 'job-1')).rejects.toThrow(ConflictException);
      await expect(lockJobForCostWrite(queryable, 'job-1')).rejects.toThrow(
        REOPEN_FOR_COST_WRITE_MESSAGE
      );
    }
  });

  it('reports not-found when the job row is missing', async () => {
    const { queryable } = queryableReturning([]);
    await expect(lockJobForCostWrite(queryable, 'missing')).rejects.toThrow(NotFoundException);
  });
});
