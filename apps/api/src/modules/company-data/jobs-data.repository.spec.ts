import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DatabaseService } from '../../database/database.service';
import { JobsCommandDataRepository } from './jobs-command-data.repository';
import { JobsDataRepository } from './jobs-data.repository';
import { JobsMediaDataRepository } from './jobs-media-data.repository';
import { JobsReadDataRepository } from './jobs-read-data.repository';
import { JobsRegisterDataRepository } from './jobs-register-data.repository';

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
    scheduledStartTime: null,
    scheduledEndTime: null,
    timeWindowLabel: null,
    technicianId: null,
    status: 'scheduled',
    finishOutcome: null,
    visitNotes: null,
    hasChargeActivity: null,
    registerFollowUpNote: null,
    finishedReviewedAt: null,
    finishedReviewedBy: null,
    finishedReviewDecision: null,
    createdAt: '2026-04-14T10:00:00.000Z',
    updatedAt: '2026-04-14T10:00:00.000Z',
    ...overrides
  };
}

function createRegisterEntryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'register-1',
    jobId: 'job-1',
    appointmentId: 'appointment-1',
    kind: 'part',
    description: 'Contactor',
    quantity: '1.50',
    unitOfMeasure: 'each',
    unitPrice: '125.00',
    totalAmount: '187.50',
    partNumber: 'C-100',
    inventorySourceLabel: 'truck',
    capturedByEmployeeId: 'tech-1',
    capturedByName: 'Field Tech',
    capturedAt: '2026-04-14T11:00:00.000Z',
    isVoid: false,
    voidReason: null,
    createdAt: '2026-04-14T11:00:00.000Z',
    updatedAt: '2026-04-14T11:00:00.000Z',
    ...overrides
  };
}

function createDatabaseService(
  jobRowOverrides: Record<string, unknown> = {},
  appointmentRowOverrides?: Record<string, unknown>,
  previousStatusForLock?: string
) {
  let insertedJobId = 'job-1';
  const appointmentRow = appointmentRowOverrides
    ? createAppointmentRow(appointmentRowOverrides)
    : null;
  const queryable = {
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes("nextval('job_number_sequence')")) {
        return { rows: [{ nextNumber: 1004 }] };
      }

      // The in-transaction "select status ... for update" the status-change hook reads.
      if (sql.includes('from jobs where id = $1 for update')) {
        return { rows: previousStatusForLock ? [{ status: previousStatusForLock }] : [] };
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
    transaction: jest.fn(async (callback: (executor: typeof queryable) => Promise<void>) =>
      callback(queryable)
    )
  };

  return { databaseService, queryable };
}

function createJobsDataRepository(databaseService: unknown): JobsDataRepository {
  const typedDatabaseService = databaseService as DatabaseService;
  const readRepository = new JobsReadDataRepository(typedDatabaseService);

  return new JobsDataRepository(
    readRepository,
    new JobsCommandDataRepository(typedDatabaseService, readRepository),
    new JobsRegisterDataRepository(typedDatabaseService),
    new JobsMediaDataRepository(typedDatabaseService)
  );
}

describe('JobsDataRepository', () => {
  it('can be resolved through Nest with typed child repositories', async () => {
    const { databaseService } = createDatabaseService();
    const moduleRef = await Test.createTestingModule({
      providers: [
        { provide: DatabaseService, useValue: databaseService },
        JobsRegisterDataRepository,
        JobsMediaDataRepository,
        JobsReadDataRepository,
        JobsCommandDataRepository,
        JobsDataRepository
      ]
    }).compile();

    expect(moduleRef.get(JobsDataRepository)).toBeInstanceOf(JobsDataRepository);

    await moduleRef.close();
  });

  it('leaves workOrderNumber unset when job creation receives a blank work order', async () => {
    const { databaseService, queryable } = createDatabaseService();
    const repository = createJobsDataRepository(databaseService);

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

    const insertCall = queryable.query.mock.calls.find(([sql]) =>
      String(sql).includes('insert into jobs')
    );
    expect(insertCall?.[1]?.[9]).toBeNull();
    expect(job.workOrderNumber).toBeUndefined();
  });

  it('cancels every non-cancelled appointment when a job is cancelled', async () => {
    const { databaseService, queryable } = createDatabaseService({ status: 'cancelled' });
    const repository = createJobsDataRepository(databaseService);

    await repository.updateJobStatus(
      'job-1',
      'cancelled',
      'Dispatcher',
      '2026-04-14T11:00:00.000Z'
    );

    const appointmentUpdateCall = queryable.query.mock.calls.find(([sql]) =>
      String(sql).includes('update appointments')
    );
    const appointmentUpdateSql = String(appointmentUpdateCall?.[0] ?? '');
    expect(appointmentUpdateSql).toContain("status <> 'cancelled'");
    expect(appointmentUpdateSql).not.toContain('scheduled_date');
    expect(appointmentUpdateCall?.[1]).toEqual(['job-1', '2026-04-14T11:00:00.000Z']);

    const timelineKinds = queryable.query.mock.calls
      .filter(([sql]) => String(sql).includes('insert into job_timeline_entries'))
      .map(([, params]) => params?.[4]);
    expect(timelineKinds).toEqual(['jobStatusUpdated', 'syncFlag']);
  });

  it('freezes a job-cost snapshot when a job is completed', async () => {
    const { databaseService, queryable } = createDatabaseService(
      { status: 'completed' },
      undefined,
      'inProgress'
    );
    const repository = createJobsDataRepository(databaseService);

    await repository.updateJobStatus(
      'job-1',
      'completed',
      'Olivia Owner',
      '2026-06-02T00:00:00.000Z'
    );

    const snapshotInsert = queryable.query.mock.calls.find(([sql]) =>
      String(sql).includes('insert into job_cost_snapshots')
    );
    expect(snapshotInsert).toBeDefined();
    // The status row is locked first so the hook can distinguish completion from reopen.
    const lockSelect = queryable.query.mock.calls.find(([sql]) =>
      String(sql).includes('from jobs where id = $1 for update')
    );
    expect(lockSelect).toBeDefined();
  });

  it('does not re-freeze a snapshot when an already-completed job is set to completed', async () => {
    const { databaseService, queryable } = createDatabaseService(
      { status: 'completed' },
      undefined,
      'completed'
    );
    const repository = createJobsDataRepository(databaseService);

    await repository.updateJobStatus(
      'job-1',
      'completed',
      'Olivia Owner',
      '2026-06-02T00:00:00.000Z'
    );

    const snapshotWrite = queryable.query.mock.calls.find(([sql]) =>
      String(sql).includes('job_cost_snapshots')
    );
    expect(snapshotWrite).toBeUndefined();
  });

  it('supersedes the snapshot (no insert) when a completed job is reopened', async () => {
    const { databaseService, queryable } = createDatabaseService(
      { status: 'inProgress' },
      undefined,
      'completed'
    );
    const repository = createJobsDataRepository(databaseService);

    await repository.updateJobStatus(
      'job-1',
      'inProgress',
      'Alex Admin',
      '2026-06-02T00:00:00.000Z'
    );

    const supersede = queryable.query.mock.calls.find(([sql]) =>
      String(sql).includes('update job_cost_snapshots set superseded_at')
    );
    expect(supersede).toBeDefined();
    const snapshotInsert = queryable.query.mock.calls.find(([sql]) =>
      String(sql).includes('insert into job_cost_snapshots')
    );
    expect(snapshotInsert).toBeUndefined();
  });

  it('rejects a status change when the locked status differs from the expected status', async () => {
    const { databaseService, queryable } = createDatabaseService({}, undefined, 'completed');
    const repository = createJobsDataRepository(databaseService);

    // Caller validated against 'inProgress', but the row is now 'completed' under the lock.
    await expect(
      repository.updateJobStatus(
        'job-1',
        'scheduled',
        'Alex Admin',
        '2026-06-02T00:00:00.000Z',
        'inProgress'
      )
    ).rejects.toBeInstanceOf(ConflictException);

    const statusUpdate = queryable.query.mock.calls.find(([sql]) =>
      String(sql).includes('update jobs')
    );
    expect(statusUpdate).toBeUndefined();
  });

  it('does not write a job-cost snapshot when a job is cancelled', async () => {
    const { databaseService, queryable } = createDatabaseService(
      { status: 'cancelled' },
      undefined,
      'inProgress'
    );
    const repository = createJobsDataRepository(databaseService);

    await repository.updateJobStatus(
      'job-1',
      'cancelled',
      'Dispatcher',
      '2026-04-14T11:00:00.000Z'
    );

    const snapshotWrite = queryable.query.mock.calls.find(([sql]) =>
      String(sql).includes('job_cost_snapshots')
    );
    expect(snapshotWrite).toBeUndefined();
  });

  it('counts only non-cancelled appointments for cancellation warnings', async () => {
    const databaseService = {
      query: jest.fn(async (_sql: string, _params?: unknown[]) => ({
        rows: [{ appointmentCount: '2' }]
      }))
    };
    const repository = createJobsDataRepository(databaseService);

    const count = await repository.countCancellableAppointments('job-1');

    expect(count).toBe(2);
    expect(databaseService.query.mock.calls[0]?.[0]).toContain("status <> 'cancelled'");
    expect(databaseService.query.mock.calls[0]?.[0]).not.toContain('scheduled_date');
    expect(databaseService.query.mock.calls[0]?.[1]).toEqual(['job-1']);
  });

  it('records appointment creation in the job timeline', async () => {
    const { databaseService } = createDatabaseService();
    const repository = createJobsDataRepository(databaseService);

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

  it('persists structured appointment times when creating an appointment', async () => {
    const { databaseService } = createDatabaseService();
    const repository = createJobsDataRepository(databaseService);

    await repository.createAppointment(
      'job-1',
      {
        scheduledDate: '2026-04-15',
        scheduledStartTime: '13:00',
        scheduledEndTime: '15:00',
        timeWindowLabel: '1:00 PM - 3:00 PM',
        technicianId: 'tech-1'
      },
      'Dispatcher',
      '2026-04-14T11:00:00.000Z'
    );

    const appointmentInsertCall = databaseService.query.mock.calls.find(([sql]) =>
      String(sql).includes('insert into appointments')
    );
    expect(String(appointmentInsertCall?.[0] ?? '')).toContain('scheduled_start_time');
    expect(appointmentInsertCall?.[1]?.slice(2, 7)).toEqual([
      '2026-04-15',
      '13:00',
      '15:00',
      '1:00 PM - 3:00 PM',
      'tech-1'
    ]);

    const timelineCall = databaseService.query.mock.calls.find(([sql]) =>
      String(sql).includes('insert into job_timeline_entries')
    );
    expect(timelineCall?.[1]?.[5]).toBe('Appointment added for 2026-04-15 from 13:00 to 15:00.');
  });

  it('maps structured appointment times when listing appointments for a job', async () => {
    const databaseService = {
      query: jest.fn(async (_sql: string, _params?: unknown[]) => ({
        rows: [
          createAppointmentRow({
            scheduledDate: '2026-04-15',
            scheduledStartTime: '08:30:00',
            scheduledEndTime: '10:15:00'
          })
        ]
      }))
    };
    const repository = createJobsDataRepository(databaseService);

    const appointments = await repository.listAppointmentsForJob('job-1');

    expect(appointments[0]).toMatchObject({
      scheduledDate: '2026-04-15',
      scheduledStartTime: '08:30',
      scheduledEndTime: '10:15'
    });
    expect(String(databaseService.query.mock.calls[0]?.[0] ?? '')).toContain(
      'scheduled_start_time as "scheduledStartTime"'
    );
    expect(String(databaseService.query.mock.calls[0]?.[0] ?? '')).toContain(
      'scheduled_start_time asc nulls last'
    );
  });

  it('lists dispatch appointments from the date window without hydrating timelines', async () => {
    const databaseService = {
      query: jest.fn(async (_sql: string, _params?: unknown[]) => ({
        rows: [
          {
            appointmentId: 'appointment-1',
            jobId: 'job-1',
            jobNumber: '1001',
            jobSummary: 'No cooling',
            jobStatus: 'scheduled',
            jobType: 'Service',
            workOrderNumber: null,
            status: 'scheduled',
            scheduledDate: '2026-05-23',
            scheduledStartTime: '08:30:00',
            scheduledEndTime: '10:15:00',
            timeWindowLabel: null,
            technicianId: 'tech-1',
            technicianName: 'Taylor Tech',
            locationId: 'location-1',
            locationName: 'Main Shop',
            locationAddressLine1: '123 Main',
            locationCity: 'Blaine',
            locationState: 'WA',
            billToCustomerId: 'customer-1',
            billToCustomerName: 'Acme',
            customerName: 'Acme',
            needsOfficeReview: true
          }
        ]
      }))
    };
    const repository = createJobsDataRepository(databaseService);

    const appointments = await repository.listDispatchAppointments('2026-05-23', '2026-05-23');
    const sql = String(databaseService.query.mock.calls[0]?.[0] ?? '');

    expect(appointments[0]).toMatchObject({
      appointmentId: 'appointment-1',
      scheduledDate: '2026-05-23',
      scheduledStartTime: '08:30',
      scheduledEndTime: '10:15',
      needsOfficeReview: true
    });
    expect(databaseService.query.mock.calls[0]?.[1]).toEqual(['2026-05-23', '2026-05-23']);
    expect(sql).toContain('appointment.scheduled_date between $1::date and $2::date');
    expect(sql).toContain("appointment.status <> 'cancelled'");
    expect(sql).toContain("job.status not in ('closed', 'cancelled')");
    expect(sql).not.toContain('job_timeline_entries');
  });

  it('loads one job detail with a bounded recent timeline window', async () => {
    const databaseService = {
      query: jest.fn(async (sql: string, _params?: unknown[]) => {
        if (String(sql).includes('from jobs')) {
          return { rows: [createJobRow()] };
        }

        if (String(sql).includes('from appointments')) {
          return {
            rows: [
              createAppointmentRow({
                scheduledDate: '2026-05-23',
                scheduledStartTime: '08:00:00'
              })
            ]
          };
        }

        if (String(sql).includes('from job_timeline_entries')) {
          return {
            rows: [
              {
                id: 'timeline-3',
                jobId: 'job-1',
                occurredAt: '2026-05-23T12:00:00.000Z',
                actorName: 'Dispatcher',
                kind: 'jobNote',
                message: 'Third entry.'
              },
              {
                id: 'timeline-2',
                jobId: 'job-1',
                occurredAt: '2026-05-23T11:00:00.000Z',
                actorName: 'Dispatcher',
                kind: 'jobNote',
                message: 'Second entry.'
              },
              {
                id: 'timeline-1',
                jobId: 'job-1',
                occurredAt: '2026-05-23T10:00:00.000Z',
                actorName: 'Dispatcher',
                kind: 'jobNote',
                message: 'First entry.'
              }
            ]
          };
        }

        return { rows: [] };
      })
    };
    const repository = createJobsDataRepository(databaseService);

    const detail = await repository.getJobDetailById('job-1', 2);
    const timelineQuery = databaseService.query.mock.calls.find(([sql]) =>
      String(sql).includes('from job_timeline_entries')
    );

    expect(detail?.timelineHasMore).toBe(true);
    expect(detail?.timelineLimit).toBe(2);
    expect(detail?.appointments[0]).toMatchObject({
      id: 'appointment-1',
      scheduledDate: '2026-05-23',
      scheduledStartTime: '08:00'
    });
    expect(detail?.job.timeline.map((entry) => entry.id)).toEqual(['timeline-2', 'timeline-3']);
    expect(String(timelineQuery?.[0] ?? '')).toContain('order by occurred_at desc, id desc');
    expect(String(timelineQuery?.[0] ?? '')).toContain('limit $2');
    expect(timelineQuery?.[1]).toEqual(['job-1', 3]);
  });

  it('lists compact jobs queue pages without hydrating timelines', async () => {
    const databaseService = {
      query: jest.fn(async (_sql: string, _params?: unknown[]) => ({
        rows: [
          {
            id: 'job-1',
            jobNumber: '1001',
            locationId: 'location-1',
            locationName: 'Main Shop',
            billToCustomerId: 'customer-1',
            billToCustomerName: 'Acme',
            jobType: 'Service',
            category: 'General',
            origin: 'Phone',
            summary: 'No cooling',
            status: 'scheduled',
            workOrderNumber: null,
            needsScheduling: false,
            needsOfficeReview: true,
            nextAppointmentId: 'appointment-1',
            nextAppointmentJobId: 'job-1',
            nextAppointmentScheduledDate: '2026-05-23',
            nextAppointmentScheduledStartTime: '08:00:00',
            nextAppointmentScheduledEndTime: '10:00:00',
            nextAppointmentTimeWindowLabel: null,
            nextAppointmentTechnicianId: 'tech-1',
            nextAppointmentTechnicianName: 'Taylor Tech',
            nextAppointmentStatus: 'finished',
            nextAppointmentNeedsOfficeReview: true,
            createdAt: '2026-05-22T10:00:00.000Z',
            updatedAt: '2026-05-23T10:00:00.000Z',
            totalCount: '12'
          }
        ]
      }))
    };
    const repository = createJobsDataRepository(databaseService);

    const page = await repository.listJobsQueuePage('review', 21, {
      queueKey: 'review',
      updatedAt: '2026-05-24T10:00:00.000Z',
      id: 'job-0'
    });
    const sql = String(databaseService.query.mock.calls[0]?.[0] ?? '');

    expect(page.totalCount).toBe(12);
    expect(page.jobs[0]).toMatchObject({
      id: 'job-1',
      needsOfficeReview: true,
      nextAppointment: {
        id: 'appointment-1',
        scheduledDate: '2026-05-23',
        scheduledStartTime: '08:00',
        scheduledEndTime: '10:00',
        technicianName: 'Taylor Tech',
        needsOfficeReview: true
      }
    });
    expect(databaseService.query.mock.calls[0]?.[1]).toEqual([
      '2026-05-24T10:00:00.000Z',
      'job-0',
      21
    ]);
    expect(sql).toContain("job.status in ('new', 'scheduled', 'inProgress', 'waitingOnParts')");
    expect(sql).toContain('needs_office_review = true');
    expect(sql).toContain('next_appointment');
    expect(sql).not.toContain('job_timeline_entries');
  });

  it('keeps jobs queue total count when the requested cursor has no more rows', async () => {
    const databaseService = {
      query: jest.fn(async () => ({
        rows: [
          {
            id: null,
            totalCount: '12'
          }
        ]
      }))
    };
    const repository = createJobsDataRepository(databaseService);

    const page = await repository.listJobsQueuePage('open', 21, {
      queueKey: 'open',
      updatedAt: '2026-05-20T10:00:00.000Z',
      id: 'job-z'
    });

    expect(page.jobs).toEqual([]);
    expect(page.totalCount).toBe(12);
  });

  it('keeps jobs queue sections distinct by priority', async () => {
    const databaseService = {
      query: jest.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [] }))
    };
    const repository = createJobsDataRepository(databaseService);

    await repository.listJobsQueuePage('waitingOnParts', 20);
    await repository.listJobsQueuePage('unscheduled', 20);
    await repository.listJobsQueuePage('open', 20);

    const [waitingSql, unscheduledSql, openSql] = databaseService.query.mock.calls.map(([sql]) =>
      String(sql)
    );
    expect(waitingSql).toContain("needs_office_review = false and status = 'waitingOnParts'");
    expect(unscheduledSql).toContain(
      "needs_office_review = false and status <> 'waitingOnParts' and needs_scheduling = true"
    );
    expect(openSql).toContain(
      "needs_office_review = false and status <> 'waitingOnParts' and needs_scheduling = false"
    );
  });

  it('acknowledges prior finished visit review when a follow-up appointment is added', async () => {
    const { databaseService, queryable } = createDatabaseService();
    (queryable.query as jest.Mock).mockImplementation(async (sql: string, _params?: unknown[]) => {
      if (sql.includes('reviewed_appointments')) {
        return { rows: [{ reviewedCount: '1' }] };
      }

      if (sql.includes("nextval('job_number_sequence')")) {
        return { rows: [{ nextNumber: 1004 }] };
      }

      return { rows: [] };
    });
    const repository = createJobsDataRepository(databaseService);

    await repository.createAppointment(
      'job-1',
      {
        scheduledDate: '2026-04-16',
        timeWindowLabel: '8:00 AM - 10:00 AM',
        technicianId: 'tech-1'
      },
      'Dispatcher',
      '2026-04-14T11:00:00.000Z',
      queryable as never
    );

    const acknowledgementCall = queryable.query.mock.calls.find(([sql]) =>
      String(sql).includes('reviewed_appointments')
    );
    expect(acknowledgementCall?.[1]).toEqual([
      'job-1',
      '2026-04-14T11:00:00.000Z',
      'Dispatcher',
      'followUpScheduled'
    ]);
    const timelineEntries = queryable.query.mock.calls
      .filter(([sql]) => String(sql).includes('insert into job_timeline_entries'))
      .map(([, params]) => ({ kind: params?.[4], message: params?.[5] }));
    expect(timelineEntries).toEqual(
      expect.arrayContaining([
        {
          kind: 'finishedVisitReviewAcknowledged',
          message:
            'Finished visit review acknowledged: follow-up appointment scheduled under this job.'
        },
        { kind: 'appointmentCreated', message: 'Appointment added for 2026-04-16.' }
      ])
    );
  });

  it('acknowledges finished visit review when the office keeps a job open', async () => {
    const { databaseService, queryable } = createDatabaseService();
    (queryable.query as jest.Mock).mockImplementation(async (sql: string) => {
      if (sql.includes('reviewed_appointments')) {
        return { rows: [{ reviewedCount: '1' }] };
      }

      return { rows: [] };
    });
    const repository = createJobsDataRepository(databaseService);

    await repository.acknowledgeFinishedVisitReview(
      'job-1',
      'keptOpen',
      'Dispatcher',
      '2026-04-14T11:00:00.000Z'
    );

    const acknowledgementCall = queryable.query.mock.calls.find(([sql]) =>
      String(sql).includes('reviewed_appointments')
    );
    expect(acknowledgementCall?.[1]).toEqual([
      'job-1',
      '2026-04-14T11:00:00.000Z',
      'Dispatcher',
      'keptOpen'
    ]);
    const timelineCall = queryable.query.mock.calls.find(
      ([sql], index) => String(sql).includes('insert into job_timeline_entries') && index > 0
    );
    expect(timelineCall?.[1]?.[4]).toBe('finishedVisitReviewAcknowledged');
    expect(timelineCall?.[1]?.[5]).toBe(
      'Finished visit review acknowledged: job kept open for office follow-up.'
    );
  });

  it('records appointment schedule, appointment status, and notes in the job timeline', async () => {
    const { queryable, databaseService } = createDatabaseService(
      {},
      { scheduledDate: '2026-04-15' }
    );
    const repository = createJobsDataRepository(databaseService);

    await repository.updateAppointmentSchedule(
      'appointment-1',
      {
        scheduledDate: '2026-04-16',
        scheduledStartTime: '08:00',
        scheduledEndTime: '10:00',
        timeWindowLabel: '8:00 AM - 10:00 AM',
        technicianId: 'tech-2'
      },
      'Dispatcher',
      '2026-04-14T11:00:00.000Z'
    );
    await repository.updateAppointmentStatus(
      'appointment-1',
      'cancelled',
      'Dispatcher',
      '2026-04-14T11:30:00.000Z'
    );
    await repository.addJobNote(
      'job-1',
      'Customer asked for a morning return visit.',
      'Dispatcher'
    );

    const timelineEntries = queryable.query.mock.calls
      .filter(([sql]) => String(sql).includes('insert into job_timeline_entries'))
      .map(([, params]) => ({ kind: params?.[4], message: params?.[5] }));
    expect(timelineEntries).toEqual(
      expect.arrayContaining([
        {
          kind: 'appointmentScheduleUpdated',
          message:
            'Appointment scheduling details updated for 2026-04-16 from 08:00 to 10:00 during 8:00 AM - 10:00 AM with technician assignment updated.'
        },
        { kind: 'appointmentStatusUpdated', message: 'Appointment status changed to cancelled.' },
        { kind: 'jobNote', message: 'Customer asked for a morning return visit.' }
      ])
    );
  });

  it('clears structured appointment times when an appointment is moved off the schedule', async () => {
    const { queryable, databaseService } = createDatabaseService(
      {},
      { scheduledDate: '2026-04-15', scheduledStartTime: '08:00:00', scheduledEndTime: '10:00:00' }
    );
    const repository = createJobsDataRepository(databaseService);

    await repository.updateAppointmentSchedule(
      'appointment-1',
      { timeWindowLabel: 'Call before scheduling', technicianId: 'tech-2' },
      'Dispatcher',
      '2026-04-14T11:00:00.000Z'
    );

    const appointmentUpdateCall = queryable.query.mock.calls.find(([sql]) =>
      String(sql).includes('update appointments')
    );
    expect(String(appointmentUpdateCall?.[0] ?? '')).toContain('scheduled_start_time = $3');
    expect(appointmentUpdateCall?.[1]?.slice(1, 5)).toEqual([
      null,
      null,
      null,
      'Call before scheduling'
    ]);
  });

  it.each(['scheduled', 'arrived', 'working', 'noAnswer'] as const)(
    'writes an appointmentStatusUpdated entry when an appointment is moved to %s',
    async (status) => {
      const { queryable, databaseService } = createDatabaseService(
        {},
        { scheduledDate: '2026-04-15' }
      );
      const repository = createJobsDataRepository(databaseService);

      await repository.updateAppointmentStatus(
        'appointment-1',
        status,
        'Field Tech',
        '2026-04-14T12:00:00.000Z'
      );

      const timelineEntries = queryable.query.mock.calls
        .filter(([sql]) => String(sql).includes('insert into job_timeline_entries'))
        .map(([, params]) => ({ kind: params?.[4], message: params?.[5] }));
      expect(timelineEntries).toEqual(
        expect.arrayContaining([
          { kind: 'appointmentStatusUpdated', message: `Appointment status changed to ${status}.` }
        ])
      );
      expect(
        timelineEntries.find((entry) => entry.kind === 'appointmentFinishedReview')
      ).toBeUndefined();
    }
  );

  it('writes both appointmentStatusUpdated and appointmentFinishedReview entries when finishing an appointment', async () => {
    const { queryable, databaseService } = createDatabaseService(
      {},
      { scheduledDate: '2026-04-15' }
    );
    const repository = createJobsDataRepository(databaseService);

    await repository.updateAppointmentStatus(
      'appointment-1',
      'finished',
      'Field Tech',
      '2026-04-14T12:00:00.000Z',
      { finishOutcome: 'completed', visitNotes: 'All good.', hasChargeActivity: true }
    );

    const timelineEntries = queryable.query.mock.calls
      .filter(([sql]) => String(sql).includes('insert into job_timeline_entries'))
      .map(([, params]) => ({ kind: params?.[4], message: params?.[5] }));
    const kinds = timelineEntries.map((entry) => entry.kind);

    expect(kinds).toEqual(
      expect.arrayContaining(['appointmentStatusUpdated', 'appointmentFinishedReview'])
    );
    expect(kinds.indexOf('appointmentStatusUpdated')).toBeLessThan(
      kinds.indexOf('appointmentFinishedReview')
    );
  });

  it.each(['noAnswer', 'finished'] as const)(
    'guards the parent job against terminal-status flips when a %s appointment is saved',
    async (status) => {
      const { queryable, databaseService } = createDatabaseService(
        {},
        { scheduledDate: '2026-04-15' }
      );
      const repository = createJobsDataRepository(databaseService);

      await repository.updateAppointmentStatus(
        'appointment-1',
        status,
        'Field Tech',
        '2026-04-14T12:00:00.000Z',
        status === 'finished' ? { finishOutcome: 'completed', hasChargeActivity: true } : undefined
      );

      const jobStatusGuardCall = queryable.query.mock.calls.find(([sql]) => {
        const text = String(sql);
        return (
          text.includes('update jobs') &&
          text.includes('case') &&
          text.includes("status in ('closed'")
        );
      });
      expect(jobStatusGuardCall).toBeTruthy();
      const guardSql = String(jobStatusGuardCall?.[0] ?? '');
      expect(guardSql).toContain(
        "status in ('closed', 'cancelled', 'waitingOnParts', 'completed')"
      );
      expect(jobStatusGuardCall?.[1]?.[1]).toBe('inProgress');
    }
  );

  it('filters out cancelled jobs from a technician assigned-work query', async () => {
    const databaseService = {
      query: jest.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [] }))
    };
    const repository = createJobsDataRepository(databaseService);

    await repository.listAssignedJobsForEmployee('tech-1', new Set(['2026-04-14']));

    const querySql = String(databaseService.query.mock.calls[0]?.[0] ?? '');
    expect(querySql).toContain("job.status <> 'cancelled'");
    expect(databaseService.query.mock.calls[0]?.[1]).toEqual(['tech-1', ['2026-04-14']]);
  });

  it('treats cancelled, finished, and noAnswer appointments as not incomplete', async () => {
    const databaseService = {
      query: jest.fn(async (_sql: string, _params?: unknown[]) => ({
        rows: [{ hasIncompleteAppointment: false }]
      }))
    };
    const repository = createJobsDataRepository(databaseService);

    await repository.hasIncompleteAppointments('job-1');

    const querySql = String(databaseService.query.mock.calls[0]?.[0] ?? '');
    expect(querySql).toContain("status not in ('finished', 'cancelled', 'noAnswer')");
  });

  it('ignores cancelled appointments when checking for future-scheduled work', async () => {
    const databaseService = {
      query: jest.fn(async (_sql: string, _params?: unknown[]) => ({
        rows: [{ hasFutureAppointment: false }]
      }))
    };
    const repository = createJobsDataRepository(databaseService);

    await repository.hasFutureAppointments('job-1', '2026-04-14');

    const querySql = String(databaseService.query.mock.calls[0]?.[0] ?? '');
    expect(querySql).toContain("status <> 'cancelled'");
    expect(querySql).toContain('scheduled_date > $2::date');
  });

  it('maps register entries and excludes voided entries by default', async () => {
    const databaseService = {
      query: jest.fn(async (_sql: string, _params?: unknown[]) => ({
        rows: [createRegisterEntryRow()]
      }))
    };
    const repository = createJobsDataRepository(databaseService);

    const registerEntries = await repository.listRegisterEntriesForJob('job-1');

    expect(registerEntries[0]).toMatchObject({
      id: 'register-1',
      quantity: 1.5,
      unitPrice: 125,
      totalAmount: 187.5
    });
    expect(String(databaseService.query.mock.calls[0]?.[0] ?? '')).toContain(
      '($2::boolean = true or is_void = false)'
    );
    expect(databaseService.query.mock.calls[0]?.[1]).toEqual(['job-1', false]);
  });

  it('creates register entries and writes register timeline history', async () => {
    const queryable = {
      query: jest.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [] }))
    };
    const databaseService = {
      query: jest.fn(async (sql: string, _params?: unknown[]) => {
        if (sql.includes('from register_entries')) {
          return { rows: [createRegisterEntryRow()] };
        }

        return { rows: [] };
      }),
      transaction: jest.fn(async (callback: (executor: typeof queryable) => Promise<void>) =>
        callback(queryable)
      )
    };
    const repository = createJobsDataRepository(databaseService);

    await repository.createRegisterEntry(
      'job-1',
      {
        appointmentId: 'appointment-1',
        kind: 'part',
        description: '  Contactor  ',
        quantity: 1.5,
        unitOfMeasure: 'each',
        unitPrice: 125,
        totalAmount: 187.5,
        partNumber: 'C-100',
        inventorySourceLabel: 'truck'
      },
      { id: 'tech-1', displayName: 'Field Tech' },
      '2026-04-14T11:00:00.000Z'
    );

    const insertCall = queryable.query.mock.calls.find(([sql]) =>
      String(sql).includes('insert into register_entries')
    );
    expect(insertCall?.[1]?.[4]).toBe('Contactor');
    expect(insertCall?.[1]?.[11]).toBe('tech-1');

    const timelineCall = queryable.query.mock.calls.find(([sql]) =>
      String(sql).includes('insert into job_timeline_entries')
    );
    expect(timelineCall?.[1]?.[4]).toBe('registerEntryAdded');
    expect(timelineCall?.[1]?.[5]).toBe('Register entry added: Contactor.');
  });

  it('updates register entries and can clear nullable fields', async () => {
    const queryable = {
      query: jest.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [] }))
    };
    const databaseService = {
      query: jest.fn(async (sql: string, _params?: unknown[]) => {
        if (sql.includes('from register_entries')) {
          return { rows: [createRegisterEntryRow()] };
        }

        return { rows: [] };
      }),
      transaction: jest.fn(async (callback: (executor: typeof queryable) => Promise<void>) =>
        callback(queryable)
      )
    };
    const repository = createJobsDataRepository(databaseService);

    await repository.updateRegisterEntry(
      'register-1',
      {
        appointmentId: null,
        unitPrice: null,
        description: '  Updated contactor  '
      },
      'Dispatcher',
      '2026-04-14T12:00:00.000Z'
    );

    const updateCall = queryable.query.mock.calls.find(([sql]) =>
      String(sql).includes('update register_entries')
    );
    expect(updateCall?.[1]?.[1]).toBeNull();
    expect(updateCall?.[1]?.[3]).toBe('Updated contactor');
    expect(updateCall?.[1]?.[6]).toBeNull();

    const timelineCall = queryable.query.mock.calls.find(([sql]) =>
      String(sql).includes('insert into job_timeline_entries')
    );
    expect(timelineCall?.[1]?.[4]).toBe('registerEntryEdited');
    expect(timelineCall?.[1]?.[5]).toBe('Register entry edited: Updated contactor.');
  });

  it('voids register entries without deleting the row', async () => {
    const queryable = {
      query: jest.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [] }))
    };
    const databaseService = {
      query: jest.fn(async (sql: string, _params?: unknown[]) => {
        if (sql.includes('from register_entries')) {
          return { rows: [createRegisterEntryRow()] };
        }

        return { rows: [] };
      }),
      transaction: jest.fn(async (callback: (executor: typeof queryable) => Promise<void>) =>
        callback(queryable)
      )
    };
    const repository = createJobsDataRepository(databaseService);

    await repository.voidRegisterEntry(
      'register-1',
      'Duplicate line.',
      'Dispatcher',
      '2026-04-14T12:00:00.000Z'
    );

    const updateCall = queryable.query.mock.calls.find(([sql]) =>
      String(sql).includes('update register_entries')
    );
    expect(String(updateCall?.[0] ?? '')).toContain('is_void = true');
    expect(updateCall?.[1]).toEqual(['register-1', 'Duplicate line.', '2026-04-14T12:00:00.000Z']);

    const timelineCall = queryable.query.mock.calls.find(([sql]) =>
      String(sql).includes('insert into job_timeline_entries')
    );
    expect(timelineCall?.[1]?.[4]).toBe('registerEntryVoided');
    expect(timelineCall?.[1]?.[5]).toBe(
      'Register entry voided: Contactor. Reason: Duplicate line.'
    );
  });

  it('persists a new media attachment row with the mediaAttached timeline entry', async () => {
    const insertedMediaRow = {
      id: 'pending',
      jobId: 'job-1',
      appointmentId: 'appointment-1',
      kind: 'image',
      contentType: 'image/jpeg',
      byteSize: 12345,
      sha256: 'a'.repeat(64),
      originalFilename: 'compressor.jpg',
      caption: 'Compressor before cleaning',
      capturedByEmployeeId: 'tech-1',
      capturedByName: 'Field Tech',
      capturedAt: '2026-04-14T11:00:00.000Z',
      storagePath: null,
      uploadedAt: null,
      isVoid: false,
      voidReason: null,
      createdAt: '2026-04-14T11:00:00.000Z',
      updatedAt: '2026-04-14T11:00:00.000Z'
    };
    let writtenMediaId: string | undefined;
    const queryable = {
      query: jest.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes('insert into media_attachments') && params) {
          writtenMediaId = params[0] as string;
        }
        return { rows: [] };
      })
    };
    const databaseService = {
      query: jest.fn(async (sql: string, _params?: unknown[]) => {
        if (sql.includes('from media_attachments')) {
          return { rows: [{ ...insertedMediaRow, id: writtenMediaId ?? insertedMediaRow.id }] };
        }
        return { rows: [] };
      }),
      transaction: jest.fn(async (callback: (executor: typeof queryable) => Promise<void>) =>
        callback(queryable)
      )
    };
    const repository = createJobsDataRepository(databaseService);

    await repository.createMediaAttachment(
      'job-1',
      {
        appointmentId: 'appointment-1',
        kind: 'image',
        contentType: 'image/jpeg',
        byteSize: 12345,
        sha256: 'a'.repeat(64),
        originalFilename: 'compressor.jpg',
        caption: 'Compressor before cleaning',
        capturedAt: '2026-04-14T11:00:00.000Z',
        capturedByEmployeeId: 'tech-1',
        capturedByName: 'Field Tech'
      },
      '2026-04-14T11:00:00.000Z'
    );

    const insertCall = queryable.query.mock.calls.find(([sql]) =>
      String(sql).includes('insert into media_attachments')
    );
    expect(insertCall).toBeTruthy();
    // Confirm storage_path / uploaded_at start null and is_void starts false.
    const insertSql = String(insertCall?.[0] ?? '');
    expect(insertSql).toContain('null, null, false, null');

    const timelineCall = queryable.query.mock.calls.find(([sql]) =>
      String(sql).includes('insert into job_timeline_entries')
    );
    expect(timelineCall?.[1]?.[4]).toBe('mediaAttached');
    expect(timelineCall?.[1]?.[5]).toBe('Field Tech attached compressor.jpg.');
  });

  it('dedupes media only against active rows', async () => {
    const mediaRow = {
      id: 'media-1',
      jobId: 'job-1',
      appointmentId: null,
      kind: 'image',
      contentType: 'image/jpeg',
      byteSize: 1024,
      sha256: 'a'.repeat(64),
      originalFilename: 'photo.jpg',
      caption: null,
      capturedByEmployeeId: 'tech-1',
      capturedByName: 'Field Tech',
      capturedAt: '2026-04-14T11:00:00.000Z',
      storagePath: null,
      uploadedAt: null,
      isVoid: false,
      voidReason: null,
      createdAt: '2026-04-14T11:00:00.000Z',
      updatedAt: '2026-04-14T11:00:00.000Z'
    };
    const databaseService = {
      query: jest.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [mediaRow] }))
    };
    const repository = createJobsDataRepository(databaseService);

    await repository.findMediaAttachmentByJobAndSha('job-1', 'a'.repeat(64));

    const querySql = String(databaseService.query.mock.calls[0]?.[0] ?? '');
    expect(querySql).toContain('job_id = $1');
    expect(querySql).toContain('sha256 = $2');
    expect(querySql).toContain('is_void = false');
  });

  it('marks a media row as uploaded by writing storage_path and uploaded_at together', async () => {
    const mediaRow = {
      id: 'media-1',
      jobId: 'job-1',
      appointmentId: null,
      kind: 'image',
      contentType: 'image/jpeg',
      byteSize: 1024,
      sha256: 'b'.repeat(64),
      originalFilename: 'photo.jpg',
      caption: null,
      capturedByEmployeeId: 'tech-1',
      capturedByName: 'Field Tech',
      capturedAt: '2026-04-14T11:00:00.000Z',
      storagePath: 'job-1/media-1.jpg',
      uploadedAt: '2026-04-14T11:05:00.000Z',
      isVoid: false,
      voidReason: null,
      createdAt: '2026-04-14T11:00:00.000Z',
      updatedAt: '2026-04-14T11:05:00.000Z'
    };
    const databaseService = {
      query: jest.fn(async (sql: string, _params?: unknown[]) => {
        if (sql.includes('from media_attachments')) {
          return { rows: [mediaRow] };
        }
        return { rows: [] };
      })
    };
    const repository = createJobsDataRepository(databaseService);

    await repository.markMediaAttachmentBlobUploaded(
      'media-1',
      'job-1/media-1.jpg',
      '2026-04-14T11:05:00.000Z'
    );

    const updateCall = databaseService.query.mock.calls.find(([sql]) =>
      String(sql).includes('update media_attachments')
    );
    const updateSql = String(updateCall?.[0] ?? '');
    expect(updateSql).toContain('storage_path = $2');
    expect(updateSql).toContain('uploaded_at = $3');
    expect(updateCall?.[1]).toEqual(['media-1', 'job-1/media-1.jpg', '2026-04-14T11:05:00.000Z']);
  });

  it('voids a media attachment while keeping the row and writing mediaVoided history', async () => {
    const queryable = {
      query: jest.fn(async (sql: string, _params?: unknown[]) => {
        if (sql.includes('from media_attachments')) {
          return {
            rows: [
              {
                id: 'media-1',
                jobId: 'job-1',
                appointmentId: null,
                kind: 'image',
                contentType: 'image/jpeg',
                byteSize: 1024,
                sha256: 'c'.repeat(64),
                originalFilename: 'photo.jpg',
                caption: null,
                capturedByEmployeeId: 'tech-1',
                capturedByName: 'Field Tech',
                capturedAt: '2026-04-14T11:00:00.000Z',
                storagePath: 'job-1/media-1.jpg',
                uploadedAt: '2026-04-14T11:05:00.000Z',
                isVoid: false,
                voidReason: null,
                createdAt: '2026-04-14T11:00:00.000Z',
                updatedAt: '2026-04-14T11:05:00.000Z'
              }
            ]
          };
        }
        return { rows: [] };
      })
    };
    const databaseService = {
      query: jest.fn(async (sql: string, params?: unknown[]) => queryable.query(sql, params)),
      transaction: jest.fn(async (callback: (executor: typeof queryable) => Promise<void>) =>
        callback(queryable)
      )
    };
    const repository = createJobsDataRepository(databaseService);

    await repository.voidMediaAttachment(
      'media-1',
      'Wrong job',
      'Dispatcher',
      '2026-04-14T12:00:00.000Z'
    );

    const updateCall = queryable.query.mock.calls.find(([sql]) =>
      String(sql).includes('update media_attachments')
    );
    expect(String(updateCall?.[0] ?? '')).toContain('is_void = true');
    expect(updateCall?.[1]).toEqual(['media-1', 'Wrong job', '2026-04-14T12:00:00.000Z']);

    const timelineCall = queryable.query.mock.calls.find(([sql]) =>
      String(sql).includes('insert into job_timeline_entries')
    );
    expect(timelineCall?.[1]?.[4]).toBe('mediaVoided');
    expect(timelineCall?.[1]?.[5]).toBe('photo.jpg voided (reason: Wrong job).');
  });

  it('records caption edits without touching storage_path or void state', async () => {
    const queryable = {
      query: jest.fn(async (sql: string, _params?: unknown[]) => {
        if (sql.includes('from media_attachments')) {
          return {
            rows: [
              {
                id: 'media-1',
                jobId: 'job-1',
                appointmentId: null,
                kind: 'image',
                contentType: 'image/jpeg',
                byteSize: 1024,
                sha256: 'd'.repeat(64),
                originalFilename: 'photo.jpg',
                caption: 'Old caption',
                capturedByEmployeeId: 'tech-1',
                capturedByName: 'Field Tech',
                capturedAt: '2026-04-14T11:00:00.000Z',
                storagePath: 'job-1/media-1.jpg',
                uploadedAt: '2026-04-14T11:05:00.000Z',
                isVoid: false,
                voidReason: null,
                createdAt: '2026-04-14T11:00:00.000Z',
                updatedAt: '2026-04-14T11:05:00.000Z'
              }
            ]
          };
        }
        return { rows: [] };
      })
    };
    const databaseService = {
      query: jest.fn(async (sql: string, params?: unknown[]) => queryable.query(sql, params)),
      transaction: jest.fn(async (callback: (executor: typeof queryable) => Promise<void>) =>
        callback(queryable)
      )
    };
    const repository = createJobsDataRepository(databaseService);

    await repository.updateMediaAttachmentCaption(
      'media-1',
      { caption: 'New caption' },
      'Dispatcher',
      '2026-04-14T12:00:00.000Z'
    );

    const updateCall = queryable.query.mock.calls.find(([sql]) =>
      String(sql).includes('update media_attachments')
    );
    const updateSql = String(updateCall?.[0] ?? '');
    expect(updateSql).toContain('caption = $2');
    expect(updateSql).not.toContain('storage_path');
    expect(updateSql).not.toContain('is_void');
    expect(updateCall?.[1]).toEqual(['media-1', 'New caption', '2026-04-14T12:00:00.000Z']);

    const timelineCall = queryable.query.mock.calls.find(([sql]) =>
      String(sql).includes('insert into job_timeline_entries')
    );
    expect(timelineCall?.[1]?.[4]).toBe('mediaCaptionEdited');
    expect(timelineCall?.[1]?.[5]).toContain('photo.jpg');
    expect(timelineCall?.[1]?.[5]).toContain('New caption');
  });
});
