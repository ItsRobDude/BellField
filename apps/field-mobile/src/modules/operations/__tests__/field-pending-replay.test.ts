import { describe, expect, it } from 'vitest';
import type {
  AppointmentSummary,
  CustomerAccountSummary,
  EquipmentMutationResponse,
  EquipmentSummary,
  FieldAssignedWorkResponse,
  JobMutationResponse,
  JobSummary,
  LocationSummary
} from '@bellfield/contracts';
import {
  applyPendingOperations,
  findAppointmentBaseUpdatedAt,
  findEquipmentBaseUpdatedAt,
  findJobBaseUpdatedAt,
  findJobIdForAppointment,
  formatFinishOutcome,
  formatPendingOperation,
  mergeEquipmentMutationIntoAssignedWork,
  mergeJobMutationIntoAssignedWork
} from '../field-pending-replay';
import type { PendingOperation } from '../field-sync-types';

const baseTimestamp = '2026-05-22T10:00:00.000Z';

function buildAppointment(overrides: Partial<AppointmentSummary> = {}): AppointmentSummary {
  return {
    id: 'appt-1',
    jobId: 'job-1',
    status: 'scheduled',
    needsOfficeReview: false,
    createdAt: baseTimestamp,
    updatedAt: baseTimestamp,
    ...overrides
  };
}

function buildJob(overrides: Partial<JobSummary> = {}): JobSummary {
  return {
    id: 'job-1',
    jobNumber: '1001',
    locationId: 'location-1',
    locationName: 'Main Shop',
    billToCustomerId: 'customer-1',
    billToCustomerName: 'Acme',
    jobType: 'Service',
    category: 'General',
    origin: 'Inbound phone call',
    summary: 'No cooling',
    status: 'scheduled',
    needsScheduling: false,
    needsOfficeReview: false,
    appointments: [buildAppointment()],
    timeline: [],
    createdAt: baseTimestamp,
    updatedAt: baseTimestamp,
    ...overrides
  };
}

function buildLocation(overrides: Partial<LocationSummary> = {}): LocationSummary {
  return {
    id: 'location-1',
    name: 'Main Shop',
    customerId: 'customer-1',
    customerName: 'Acme',
    addressLine1: '123 Main',
    city: 'Blaine',
    state: 'WA',
    postalCode: '98230',
    isActive: true,
    contacts: [],
    alternateBillToCustomerIds: [],
    ...overrides
  };
}

function buildCustomer(overrides: Partial<CustomerAccountSummary> = {}): CustomerAccountSummary {
  return {
    id: 'customer-1',
    name: 'Acme',
    accountType: 'company',
    billingAddressLine1: '123 Main',
    billingCity: 'Blaine',
    billingState: 'WA',
    billingPostalCode: '98230',
    isActive: true,
    flags: [],
    ...overrides
  };
}

function buildEquipment(overrides: Partial<EquipmentSummary> = {}): EquipmentSummary {
  return {
    id: 'equipment-1',
    locationId: 'location-1',
    equipmentType: 'Condenser',
    brand: 'Carrier',
    model: 'OldModel',
    serialNumber: 'SER-OLD',
    filterSizes: ['16x25x1'],
    status: 'active',
    notes: '',
    updatedAt: baseTimestamp,
    ...overrides
  };
}

function buildSnapshot(overrides: Partial<FieldAssignedWorkResponse> = {}): FieldAssignedWorkResponse {
  return {
    jobs: [buildJob()],
    locations: [buildLocation()],
    customers: [buildCustomer()],
    equipment: [buildEquipment()],
    serverTime: baseTimestamp,
    snapshotVersion: 'v1',
    windowStartDate: '2026-05-22',
    windowEndDate: '2026-05-23',
    ...overrides
  };
}

describe('applyPendingOperations', () => {
  it('returns null when there is no snapshot yet', () => {
    expect(applyPendingOperations(null, [], 'Taylor')).toBeNull();
  });

  it('returns a fresh snapshot when no pending operations exist', () => {
    const snapshot = buildSnapshot();
    const result = applyPendingOperations(snapshot, [], 'Taylor');

    expect(result).not.toBe(snapshot);
    expect(result?.jobs[0]).not.toBe(snapshot.jobs[0]);
    expect(result?.jobs[0]?.timeline).toHaveLength(0);
  });

  it('records a job note as a local timeline entry with provenance', () => {
    const snapshot = buildSnapshot();
    const operation: PendingOperation = {
      id: 'op-note',
      kind: 'jobNote',
      jobId: 'job-1',
      note: 'Customer asked about filter sizes.',
      occurredAt: '2026-05-22T11:00:00.000Z',
      state: 'pending'
    };

    const result = applyPendingOperations(snapshot, [operation], 'Taylor Tech');

    expect(result?.jobs[0]?.timeline).toHaveLength(1);
    expect(result?.jobs[0]?.timeline[0]).toMatchObject({
      id: 'op-note-local',
      actorName: 'Taylor Tech',
      message: 'Customer asked about filter sizes.',
      kind: 'jobNote'
    });
  });

  it('reflects an appointment status change locally without touching server records', () => {
    const snapshot = buildSnapshot();
    const operation: PendingOperation = {
      id: 'op-status',
      kind: 'appointmentStatus',
      appointmentId: 'appt-1',
      status: 'arrived',
      occurredAt: baseTimestamp,
      state: 'pending'
    };

    const result = applyPendingOperations(snapshot, [operation], 'Taylor');

    expect(result?.jobs[0]?.appointments[0]?.status).toBe('arrived');
    expect(snapshot.jobs[0]?.appointments[0]?.status).toBe('scheduled');
  });

  it('marks the job and appointment as needing office review after a finish-review op', () => {
    const snapshot = buildSnapshot();
    const operation: PendingOperation = {
      id: 'op-finish',
      kind: 'appointmentFinishReview',
      appointmentId: 'appt-1',
      status: 'finished',
      finishOutcome: 'followUpNeeded',
      visitNotes: 'Needs return visit for board replacement.',
      hasChargeActivity: false,
      registerFollowUpNote: 'Order control board.',
      occurredAt: '2026-05-22T12:00:00.000Z',
      state: 'pending'
    };

    const result = applyPendingOperations(snapshot, [operation], 'Taylor Tech');
    const updatedJob = result?.jobs[0];

    expect(updatedJob?.needsOfficeReview).toBe(true);
    expect(updatedJob?.appointments[0]?.status).toBe('finished');
    expect(updatedJob?.appointments[0]?.needsOfficeReview).toBe(true);
    expect(updatedJob?.appointments[0]?.finishOutcome).toBe('followUpNeeded');
    expect(updatedJob?.timeline[0]?.kind).toBe('appointmentFinishedReview');
    expect(updatedJob?.timeline[0]?.message).toContain('Follow-up needed');
  });

  it('layers an equipment update without losing other server fields', () => {
    const snapshot = buildSnapshot();
    const operation: PendingOperation = {
      id: 'op-equipment',
      kind: 'equipmentUpdate',
      equipmentId: 'equipment-1',
      model: 'NewModel',
      serialNumber: 'SER-NEW',
      filterSizes: ['20x25x1'],
      installDate: '2024-03-10',
      status: 'active',
      notes: 'Replaced under warranty.',
      occurredAt: '2026-05-22T13:00:00.000Z',
      state: 'pending'
    };

    const result = applyPendingOperations(snapshot, [operation], 'Taylor');
    const updated = result?.equipment[0];

    expect(updated).toMatchObject({
      model: 'NewModel',
      serialNumber: 'SER-NEW',
      filterSizes: ['20x25x1'],
      installDate: '2024-03-10',
      notes: 'Replaced under warranty.',
      brand: 'Carrier'
    });
  });

  it('still applies pending edits even when sync marks them conflict or rejected (work is preserved)', () => {
    const snapshot = buildSnapshot();
    const operations: PendingOperation[] = [
      {
        id: 'op-conflict',
        kind: 'jobNote',
        jobId: 'job-1',
        note: 'Conflict with office edit.',
        occurredAt: '2026-05-22T11:00:00.000Z',
        state: 'conflict',
        lastResultMessage: 'Office edited the same job concurrently.'
      },
      {
        id: 'op-rejected',
        kind: 'jobNote',
        jobId: 'job-1',
        note: 'Server rejected this note.',
        occurredAt: '2026-05-22T11:05:00.000Z',
        state: 'rejected',
        lastResultMessage: 'Outside permission scope.'
      }
    ];

    const result = applyPendingOperations(snapshot, operations, 'Taylor');

    expect(result?.jobs[0]?.timeline).toHaveLength(2);
    expect(result?.jobs[0]?.timeline.map((entry) => entry.message)).toEqual([
      'Conflict with office edit.',
      'Server rejected this note.'
    ]);
  });
});

describe('applied sync result merging', () => {
  it('merges an applied job mutation into the cached assigned-work snapshot', () => {
    const snapshot = buildSnapshot();
    const response: JobMutationResponse = {
      ...buildJob({
        summary: 'No cooling - compressor running',
        appointments: [buildAppointment({ status: 'working', updatedAt: '2026-05-22T11:00:00.000Z' })],
        timeline: [
          {
            id: 'timeline-1',
            actorName: 'Taylor Tech',
            occurredAt: '2026-05-22T11:00:00.000Z',
            kind: 'jobNote',
            message: 'Filter cleaned.'
          }
        ],
        updatedAt: '2026-05-22T11:00:00.000Z'
      }),
      syncResult: { status: 'applied' }
    };

    const result = mergeJobMutationIntoAssignedWork(snapshot, response);

    expect(result.jobs[0]?.summary).toBe('No cooling - compressor running');
    expect(result.jobs[0]?.appointments[0]?.status).toBe('working');
    expect(result.jobs[0]?.timeline[0]?.message).toBe('Filter cleaned.');
    expect(snapshot.jobs[0]?.summary).toBe('No cooling');
  });

  it('merges an applied equipment mutation into the cached assigned-work snapshot', () => {
    const snapshot = buildSnapshot();
    const response: EquipmentMutationResponse = {
      equipment: {
        ...buildEquipment({
          model: 'NewModel',
          serialNumber: 'SER-NEW',
          updatedAt: '2026-05-22T11:00:00.000Z'
        }),
        history: []
      },
      syncResult: { status: 'applied' }
    };

    const result = mergeEquipmentMutationIntoAssignedWork(snapshot, response);

    expect(result.equipment[0]?.model).toBe('NewModel');
    expect(result.equipment[0]?.serialNumber).toBe('SER-NEW');
    expect(snapshot.equipment[0]?.model).toBe('OldModel');
  });

  it('preserves applied cache changes when a later queued operation still needs retry', () => {
    const snapshot = buildSnapshot();
    const appliedOperation: PendingOperation = {
      id: 'op-note',
      kind: 'jobNote',
      jobId: 'job-1',
      note: 'Filter cleaned.',
      occurredAt: '2026-05-22T11:00:00.000Z',
      state: 'pending'
    };
    const failedOperation: PendingOperation = {
      id: 'op-equipment',
      kind: 'equipmentUpdate',
      equipmentId: 'equipment-1',
      model: 'QueuedModel',
      status: 'active',
      notes: 'Retry later.',
      occurredAt: '2026-05-22T11:05:00.000Z',
      state: 'pending'
    };
    const appliedResponse: JobMutationResponse = {
      ...buildJob({
        timeline: [
          {
            id: 'timeline-1',
            actorName: 'Taylor Tech',
            occurredAt: appliedOperation.occurredAt,
            kind: 'jobNote',
            message: appliedOperation.note
          }
        ],
        updatedAt: '2026-05-22T11:00:00.000Z'
      }),
      syncResult: { status: 'applied' }
    };

    const cachedSnapshot = mergeJobMutationIntoAssignedWork(snapshot, appliedResponse);
    const remainingQueue = [appliedOperation, failedOperation].filter(
      (operation) => operation.id !== appliedOperation.id
    );
    const localView = applyPendingOperations(cachedSnapshot, remainingQueue, 'Taylor Tech');

    expect(cachedSnapshot.jobs[0]?.timeline[0]?.message).toBe('Filter cleaned.');
    expect(remainingQueue.map((operation) => operation.id)).toEqual(['op-equipment']);
    expect(localView?.equipment[0]?.model).toBe('QueuedModel');
  });

  it('returns the snapshot untouched when an applied job mutation belongs to a job not in the cache', () => {
    const snapshot = buildSnapshot();
    const response: JobMutationResponse = {
      ...buildJob({ id: 'job-outside-window', jobNumber: '9999', summary: 'Other tech job' }),
      syncResult: { status: 'applied' }
    };

    const result = mergeJobMutationIntoAssignedWork(snapshot, response);

    expect(result).toBe(snapshot);
    expect(result.jobs.find((job) => job.id === 'job-outside-window')).toBeUndefined();
  });

  it('returns the snapshot untouched when an applied equipment mutation is for equipment not in the cache', () => {
    const snapshot = buildSnapshot();
    const response: EquipmentMutationResponse = {
      equipment: {
        ...buildEquipment({ id: 'equipment-outside-window', model: 'OtherLocation' }),
        history: []
      },
      syncResult: { status: 'applied' }
    };

    const result = mergeEquipmentMutationIntoAssignedWork(snapshot, response);

    expect(result).toBe(snapshot);
    expect(result.equipment.find((record) => record.id === 'equipment-outside-window')).toBeUndefined();
  });

  it('does not leak syncResult or warningMessages onto the cached job summary', () => {
    const snapshot = buildSnapshot();
    const response: JobMutationResponse = {
      ...buildJob({
        appointments: [buildAppointment({ status: 'working', updatedAt: '2026-05-22T11:00:00.000Z' })],
        updatedAt: '2026-05-22T11:00:00.000Z'
      }),
      syncResult: { status: 'applied' },
      warningMessages: ['Field appointment update synced after assignment changed while the device was offline.']
    };

    const result = mergeJobMutationIntoAssignedWork(snapshot, response);

    expect(result.jobs[0]).not.toHaveProperty('syncResult');
    expect(result.jobs[0]).not.toHaveProperty('warningMessages');
    expect(result.jobs[0]?.appointments[0]?.status).toBe('working');
  });

  it('does not leak equipment history, replacement links, or syncResult onto the cached equipment summary', () => {
    const snapshot = buildSnapshot();
    const response: EquipmentMutationResponse = {
      equipment: {
        ...buildEquipment({ model: 'NewModel', updatedAt: '2026-05-22T11:00:00.000Z' }),
        history: [
          {
            id: 'history-1',
            actorName: 'Office',
            occurredAt: '2026-05-22T10:50:00.000Z',
            kind: 'edited',
            message: 'Model corrected.'
          }
        ],
        replacesEquipment: undefined,
        replacedByEquipment: undefined
      },
      syncResult: { status: 'applied' }
    };

    const result = mergeEquipmentMutationIntoAssignedWork(snapshot, response);
    const updated = result.equipment[0];

    expect(updated).not.toHaveProperty('history');
    expect(updated).not.toHaveProperty('replacesEquipment');
    expect(updated).not.toHaveProperty('replacedByEquipment');
    expect(updated?.model).toBe('NewModel');
  });

  it('keeps locally-queued edits visible on top of an office-driven schedule change brought in by refresh', () => {
    const initialSnapshot = buildSnapshot();
    const officeRefreshedSnapshot = buildSnapshot({
      jobs: [
        buildJob({
          appointments: [
            buildAppointment({
              scheduledDate: '2026-05-23',
              timeWindowLabel: '8-10 AM',
              technicianId: 'employee-2',
              technicianName: 'Sam Tech',
              status: 'scheduled',
              updatedAt: '2026-05-22T15:00:00.000Z'
            })
          ],
          updatedAt: '2026-05-22T15:00:00.000Z'
        })
      ]
    });

    const queuedNote: PendingOperation = {
      id: 'op-note',
      kind: 'jobNote',
      jobId: 'job-1',
      note: 'Customer prefers afternoon return visit.',
      occurredAt: '2026-05-22T14:00:00.000Z',
      state: 'pending'
    };

    const localBefore = applyPendingOperations(initialSnapshot, [queuedNote], 'Taylor Tech');
    const localAfter = applyPendingOperations(officeRefreshedSnapshot, [queuedNote], 'Taylor Tech');

    expect(localBefore?.jobs[0]?.appointments[0]?.scheduledDate).toBeUndefined();
    expect(localAfter?.jobs[0]?.appointments[0]?.scheduledDate).toBe('2026-05-23');
    expect(localAfter?.jobs[0]?.appointments[0]?.technicianName).toBe('Sam Tech');
    expect(localAfter?.jobs[0]?.timeline.find((entry) => entry.message === queuedNote.note)).toBeTruthy();
  });
});

describe('findJobIdForAppointment / base lookups', () => {
  it('finds the job id for a known appointment', () => {
    const snapshot = buildSnapshot();
    expect(findJobIdForAppointment(snapshot, 'appt-1')).toBe('job-1');
    expect(findJobIdForAppointment(snapshot, 'unknown')).toBeUndefined();
  });

  it('returns the snapshot updatedAt timestamps for known records', () => {
    const snapshot = buildSnapshot();

    expect(findAppointmentBaseUpdatedAt(snapshot, 'appt-1')).toBe(baseTimestamp);
    expect(findJobBaseUpdatedAt(snapshot, 'job-1')).toBe(baseTimestamp);
    expect(findEquipmentBaseUpdatedAt(snapshot, 'equipment-1')).toBe(baseTimestamp);
  });

  it('returns undefined when the snapshot is null', () => {
    expect(findAppointmentBaseUpdatedAt(null, 'appt-1')).toBeUndefined();
    expect(findJobBaseUpdatedAt(null, 'job-1')).toBeUndefined();
    expect(findEquipmentBaseUpdatedAt(null, 'equipment-1')).toBeUndefined();
  });
});

describe('formatFinishOutcome', () => {
  it('maps internal codes to readable labels', () => {
    expect(formatFinishOutcome('completed')).toBe('Completed');
    expect(formatFinishOutcome('followUpNeeded')).toBe('Follow-up needed');
    expect(formatFinishOutcome('noAccess')).toBe('No access');
  });
});

describe('formatPendingOperation', () => {
  it('formats pending, conflict, and rejected suffixes with the result message when present', () => {
    const pending: PendingOperation = {
      id: 'op-1',
      kind: 'appointmentStatus',
      appointmentId: 'appt-1',
      status: 'working',
      occurredAt: baseTimestamp,
      state: 'pending'
    };
    const conflict: PendingOperation = {
      ...pending,
      id: 'op-2',
      state: 'conflict',
      lastResultMessage: 'Office already advanced this appointment.'
    };
    const rejected: PendingOperation = {
      ...pending,
      id: 'op-3',
      state: 'rejected',
      lastResultMessage: 'Permission denied.'
    };

    expect(formatPendingOperation(pending)).toContain('pending sync');
    expect(formatPendingOperation(conflict)).toContain('conflict: Office already advanced this appointment.');
    expect(formatPendingOperation(rejected)).toContain('rejected: Permission denied.');
  });
});
