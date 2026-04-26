import { JobsDataRepository } from './jobs-data.repository';

function createJobRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    jobNumber: '1004',
    locationId: 'location-1',
    billToCustomerId: 'customer-1',
    jobType: 'service',
    category: 'service',
    origin: 'phone',
    summary: 'No cooling',
    status: 'new',
    workOrderNumber: null,
    createdAt: '2026-04-14T10:00:00.000Z',
    updatedAt: '2026-04-14T10:00:00.000Z',
    ...overrides
  };
}

function createDatabaseService(jobRowOverrides: Record<string, unknown> = {}) {
  let insertedJobId = 'job-1';
  const queryable = {
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes("nextval('job_number_sequence')")) {
        return { rows: [{ nextNumber: 1004 }] };
      }

      if (sql.includes('insert into jobs') && params) {
        insertedJobId = params[0] as string;
      }

      return { rows: [] };
    })
  };
  const databaseService = {
    query: jest.fn(async (sql: string) => {
      if (sql.includes('from jobs')) {
        return { rows: [createJobRow({ id: insertedJobId, ...jobRowOverrides })] };
      }

      return { rows: [] };
    }),
    transaction: jest.fn(async (callback: (executor: typeof queryable) => Promise<void>) => callback(queryable))
  };

  return { databaseService, queryable };
}

describe('JobsDataRepository', () => {
  it('leaves workOrderNumber unset when job creation receives a blank work order', async () => {
    const { databaseService, queryable } = createDatabaseService();
    const repository = new JobsDataRepository(databaseService as never);

    const job = await repository.createJob(
      {
        locationId: 'location-1',
        billToCustomerId: 'customer-1',
        jobType: 'service',
        category: 'service',
        origin: 'phone',
        summary: 'No cooling',
        workOrderNumber: '   '
      },
      'Dispatcher',
      'customer-1',
      'Main Shop'
    );

    const insertCall = queryable.query.mock.calls.find(([sql]) => String(sql).includes('insert into jobs'));
    expect(insertCall?.[1]?.[9]).toBeNull();
    expect(job.workOrderNumber).toBeUndefined();
  });

  it('cancels every non-cancelled appointment when a job is cancelled', async () => {
    const { databaseService, queryable } = createDatabaseService({ status: 'cancelled' });
    const repository = new JobsDataRepository(databaseService as never);

    await repository.updateJobStatus('job-1', 'cancelled', 'Dispatcher', '2026-04-14T11:00:00.000Z');

    const appointmentUpdateCall = queryable.query.mock.calls.find(([sql]) => String(sql).includes('update appointments'));
    const appointmentUpdateSql = String(appointmentUpdateCall?.[0] ?? '');
    expect(appointmentUpdateSql).toContain("status <> 'cancelled'");
    expect(appointmentUpdateSql).not.toContain('scheduled_date');
    expect(appointmentUpdateCall?.[1]).toEqual(['job-1', '2026-04-14T11:00:00.000Z']);
  });

  it('counts only non-cancelled appointments for cancellation warnings', async () => {
    const databaseService = {
      query: jest.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [{ appointmentCount: '2' }] }))
    };
    const repository = new JobsDataRepository(databaseService as never);

    const count = await repository.countCancellableAppointments('job-1');

    expect(count).toBe(2);
    expect(databaseService.query.mock.calls[0]?.[0]).toContain("status <> 'cancelled'");
    expect(databaseService.query.mock.calls[0]?.[1]).toEqual(['job-1']);
  });
});
