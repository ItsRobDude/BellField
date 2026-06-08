import { describe, expect, it } from 'vitest';
import type { FieldAssignedWorkResponse } from '@bellfield/contracts';
import { applyPendingOperations } from '../field-pending-replay';
import { summarizeSyncHealth } from '../field-sync-status';
import type { PendingOperation, PendingOperationState, SyncMetadata } from '../field-sync-types';

/**
 * Scenario-style harness for the field sync model.
 * It does not boot React Native or expo-sqlite. Instead it models the queue
 * and sync outcomes as pure data and asserts BellField's preservation rules:
 *  - applied operations are removed from the queue
 *  - conflict/rejected operations stay queued with provenance for office review
 *  - network failures preserve the entire queue and surface an alert tone
 */

const actor = 'Taylor Tech';
const baseTimestamp = '2026-05-22T08:00:00.000Z';

function buildSnapshot(): FieldAssignedWorkResponse {
  return {
    jobs: [
      {
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
        appointments: [
          {
            id: 'appt-1',
            jobId: 'job-1',
            status: 'scheduled',
            needsOfficeReview: false,
            createdAt: baseTimestamp,
            updatedAt: baseTimestamp
          }
        ],
        timeline: [],
        createdAt: baseTimestamp,
        updatedAt: baseTimestamp
      }
    ],
    locations: [
      {
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
        alternateBillToCustomerIds: []
      }
    ],
    customers: [
      {
        id: 'customer-1',
        name: 'Acme',
        accountType: 'company',
        billingAddressLine1: '123 Main',
        billingCity: 'Blaine',
        billingState: 'WA',
        billingPostalCode: '98230',
        isActive: true,
        flags: []
      }
    ],
    equipment: [
      {
        id: 'equipment-1',
        locationId: 'location-1',
        equipmentType: 'Condenser',
        brand: 'Carrier',
        model: 'OldModel',
        serialNumber: 'SER-OLD',
        filterSizes: ['16x25x1'],
        status: 'active',
        notes: '',
        updatedAt: baseTimestamp
      }
    ],
    catalogItems: [],
    agreementCoverage: [],
    serverTime: baseTimestamp,
    snapshotVersion: 'v1',
    windowStartDate: '2026-05-22',
    windowEndDate: '2026-05-23'
  };
}

function buildQueue(): PendingOperation[] {
  return [
    {
      id: 'op-note',
      kind: 'jobNote',
      jobId: 'job-1',
      note: 'Filter cleaned. Replaced screws on cabinet.',
      occurredAt: '2026-05-22T09:10:00.000Z',
      state: 'pending'
    },
    {
      id: 'op-status',
      kind: 'appointmentStatus',
      appointmentId: 'appt-1',
      status: 'working',
      occurredAt: '2026-05-22T09:15:00.000Z',
      state: 'pending'
    },
    {
      id: 'op-equipment',
      kind: 'equipmentUpdate',
      equipmentId: 'equipment-1',
      model: 'NewModel',
      serialNumber: 'SER-NEW',
      filterSizes: ['20x25x1'],
      installDate: '2024-04-01',
      status: 'active',
      notes: 'Filter swapped during visit.',
      occurredAt: '2026-05-22T09:20:00.000Z',
      state: 'pending'
    }
  ];
}

type SyncOutcome =
  | { kind: 'applied'; operationId: string }
  | { kind: 'conflict'; operationId: string; message: string }
  | { kind: 'rejected'; operationId: string; message: string };

function processSyncOutcomes(
  queue: PendingOperation[],
  outcomes: SyncOutcome[]
): PendingOperation[] {
  let nextQueue = [...queue];

  for (const outcome of outcomes) {
    if (outcome.kind === 'applied') {
      nextQueue = nextQueue.filter((operation) => operation.id !== outcome.operationId);
      continue;
    }

    const nextState: PendingOperationState = outcome.kind;
    nextQueue = nextQueue.map((operation) =>
      operation.id === outcome.operationId
        ? { ...operation, state: nextState, lastResultMessage: outcome.message }
        : operation
    );
  }

  return nextQueue;
}

describe('field sync scenario harness', () => {
  it('shows queued local edits before any sync attempt', () => {
    const snapshot = buildSnapshot();
    const queue = buildQueue();
    const view = applyPendingOperations(snapshot, queue, actor);

    expect(view?.jobs[0]?.timeline).toHaveLength(1);
    expect(view?.jobs[0]?.timeline[0]?.message).toContain('Filter cleaned');
    expect(view?.jobs[0]?.appointments[0]?.status).toBe('working');
    expect(view?.equipment[0]?.model).toBe('NewModel');
  });

  it('removes applied operations and keeps conflict/rejected ops queued with provenance', () => {
    const queue = buildQueue();
    const outcomes: SyncOutcome[] = [
      { kind: 'applied', operationId: 'op-note' },
      {
        kind: 'conflict',
        operationId: 'op-status',
        message: 'Office advanced the appointment first.'
      },
      {
        kind: 'rejected',
        operationId: 'op-equipment',
        message: 'Equipment is locked from edits in this window.'
      }
    ];

    const nextQueue = processSyncOutcomes(queue, outcomes);

    expect(nextQueue).toHaveLength(2);
    expect(nextQueue.map((operation) => operation.id)).toEqual(['op-status', 'op-equipment']);
    expect(nextQueue[0]).toMatchObject({
      id: 'op-status',
      state: 'conflict',
      lastResultMessage: 'Office advanced the appointment first.'
    });
    expect(nextQueue[1]).toMatchObject({
      id: 'op-equipment',
      state: 'rejected',
      lastResultMessage: 'Equipment is locked from edits in this window.'
    });
  });

  it('keeps conflict/rejected ops visible in the local view (work is preserved, not silently dropped)', () => {
    const snapshot = buildSnapshot();
    const queue = buildQueue();
    const outcomes: SyncOutcome[] = [
      { kind: 'applied', operationId: 'op-note' },
      {
        kind: 'conflict',
        operationId: 'op-status',
        message: 'Office advanced the appointment first.'
      },
      {
        kind: 'rejected',
        operationId: 'op-equipment',
        message: 'Equipment is locked from edits in this window.'
      }
    ];

    const nextQueue = processSyncOutcomes(queue, outcomes);
    const view = applyPendingOperations(snapshot, nextQueue, actor);

    expect(view?.jobs[0]?.appointments[0]?.status).toBe('working');
    expect(view?.equipment[0]?.model).toBe('NewModel');

    const summary = summarizeSyncHealth(
      {
        lastSuccessfulSyncAt: '2026-05-22T09:25:00.000Z',
        lastAttemptedSyncAt: '2026-05-22T09:25:00.000Z',
        lastSnapshotVersion: 'v1',
        lastSyncError: null
      },
      nextQueue
    );

    expect(summary.tone).toBe('alert');
    expect(summary.headline).toBe('1 conflict and 1 rejected item need office review');
  });

  it('preserves the entire queue on a network failure and goes loud only because of the failure', () => {
    const queue = buildQueue();
    const failedMetadata: SyncMetadata = {
      lastSuccessfulSyncAt: '2026-05-21T17:00:00.000Z',
      lastAttemptedSyncAt: '2026-05-22T09:30:00.000Z',
      lastSnapshotVersion: 'v1',
      lastSyncError: 'Network unreachable'
    };

    const summary = summarizeSyncHealth(failedMetadata, queue);

    expect(queue).toHaveLength(3);
    expect(queue.every((operation) => operation.state === 'pending')).toBe(true);
    expect(summary.tone).toBe('alert');
    expect(summary.headline).toContain('Sync failed');
    expect(summary.detail).toBe('Network unreachable');
    expect(summary.pendingCount).toBe(3);
  });

  it('goes back to quiet once every queued op is applied and no failure remains', () => {
    const queue = buildQueue();
    const allApplied = processSyncOutcomes(queue, [
      { kind: 'applied', operationId: 'op-note' },
      { kind: 'applied', operationId: 'op-status' },
      { kind: 'applied', operationId: 'op-equipment' }
    ]);

    expect(allApplied).toHaveLength(0);

    const summary = summarizeSyncHealth(
      {
        lastSuccessfulSyncAt: '2026-05-22T09:35:00.000Z',
        lastAttemptedSyncAt: '2026-05-22T09:35:00.000Z',
        lastSnapshotVersion: 'v2',
        lastSyncError: null
      },
      allApplied
    );

    expect(summary.tone).toBe('quiet');
    expect(summary.headline).toBe('Synced');
  });
});
