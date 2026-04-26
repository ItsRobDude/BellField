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

function createAppointmentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'appointment-1',
    jobId: 'job-1',
    scheduledDate: null,
    timeWindowLabel: null,
    technicianId: null,
    status: 'scheduled',
    finishOutcome: null,
    visitNotes: null,
    hasChargeActivity: null,
    registerFollowUpNote: null,
    createdAt: '2026-04-14T10:00:00.000Z',
    updatedAt: '2026-04-14T10:00:00.000Z',
    ...overrides
  };
}

function createDatabaseService(
  jobRowOverrides: Record<string, unknown> = {},
  appointmentRowOverrides?: Record<string, unknown>
) {
  let insertedJobId = 'job-1';
  const appointmentRow = appointmentRowOverrides ? createAppointmentRow(appointmentRowOverrides) : null;
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
    query: jest.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.includes('from appointments') && sql.includes('where id = $1')) {
        return { rows: appointmentRow ? [appointmentRow] : [] };
      }

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

    const timelineKinds = queryable.query.mock.calls
      .filter(([sql]) => String(sql).includes('insert into job_timeline_entries'))
      .map(([, params]) => params?.[4]);
    expect(timelineKinds).toEqual(['jobStatusUpdated', 'syncFlag']);
  });

  it('counts only non-cancelled appointments for cancellation warnings', async () => {
    const databaseService = {
      query: jest.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [{ appointmentCount: '2' }] }))
    };
    const repository = new JobsDataRepository(databaseService as never);

    const count = await repository.countCancellableAppointments('job-1');

    expect(count).toBe(2);
    expect(databaseService.query.mock.calls[0]?.[0]).toContain("status <> 'cancelled'");
    expect(databaseService.query.mock.calls[0]?.[0]).not.toContain('scheduled_date');
    expect(databaseService.query.mock.calls[0]?.[1]).toEqual(['job-1']);
  });

  it('records appointment creation in the job timeline', async () => {
    const { databaseService } = createDatabaseService();
    const repository = new JobsDataRepository(databaseService as never);

    await repository.createAppointment(
      'job-1',
      { scheduledDate: '2026-04-15', timeWindowLabel: '1:00 PM - 3:00 PM', technicianId: 'tech-1' },
      'Dispatcher',
      '2026-04-14T11:00:00.000Z'
    );

    const timelineCall = databaseService.query.mock.calls.find(([sql]) =>
      String(sql).includes('insert into job_timeline_entries')
    );
    expect(timelineCall?.[1]?.[4]).toBe('appointmentCreated');
    expect(timelineCall?.[1]?.[5]).toBe('Appointment added for 2026-04-15.');
  });

  it('records appointment schedule, appointment status, and notes in the job timeline', async () => {
    const { queryable, databaseService } = createDatabaseService({}, { scheduledDate: '2026-04-15' });
    const repository = new JobsDataRepository(databaseService as never);

    await repository.updateAppointmentSchedule(
      'appointment-1',
      { scheduledDate: '2026-04-16', timeWindowLabel: '8:00 AM - 10:00 AM', technicianId: 'tech-2' },
      'Dispatcher',
      '2026-04-14T11:00:00.000Z'
    );
    await repository.updateAppointmentStatus(
      'appointment-1',
      'cancelled',
      'Dispatcher',
      '2026-04-14T11:30:00.000Z'
    );
    await repository.addJobNote('job-1', 'Customer asked for a morning return visit.', 'Dispatcher');

    const timelineEntries = queryable.query.mock.calls
      .filter(([sql]) => String(sql).includes('insert into job_timeline_entries'))
      .map(([, params]) => ({ kind: params?.[4], message: params?.[5] }));
    expect(timelineEntries).toEqual(
      expect.arrayContaining([
        {
          kind: 'appointmentScheduleUpdated',
          message:
            'Appointment scheduling details updated for 2026-04-16 during 8:00 AM - 10:00 AM with technician assignment updated.'
        },
        { kind: 'appointmentStatusUpdated', message: 'Appointment status changed to cancelled.' },
        { kind: 'jobNote', message: 'Customer asked for a morning return visit.' }
      ])
    );
  });
});
