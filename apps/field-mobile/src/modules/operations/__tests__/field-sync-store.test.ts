import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OwnedPendingOperation } from '../field-sync-types';

const databaseMock = vi.hoisted(() => ({
  execAsync: vi.fn(),
  getAllAsync: vi.fn(),
  getFirstAsync: vi.fn(),
  runAsync: vi.fn()
}));

const sqliteMock = vi.hoisted(() => ({
  openDatabaseAsync: vi.fn(async () => databaseMock)
}));

vi.mock('expo-sqlite', () => sqliteMock);

const occurredAt = '2026-05-23T12:00:00.000Z';

async function loadStoreModule() {
  vi.resetModules();
  return import('../field-sync-store');
}

function buildAppointmentStatusOperation(ownerEmployeeId: string): OwnedPendingOperation {
  return {
    id: 'appointment-1-status',
    ownerEmployeeId,
    kind: 'appointmentStatus',
    appointmentId: 'appointment-1',
    status: 'arrived',
    occurredAt,
    state: 'pending'
  };
}

describe('field sync store ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    databaseMock.execAsync.mockResolvedValue(undefined);
    databaseMock.getAllAsync.mockResolvedValue([]);
    databaseMock.getFirstAsync.mockResolvedValue(null);
    databaseMock.runAsync.mockResolvedValue(undefined);
  });

  it('owner-scopes replacement deletes before inserting a pending operation', async () => {
    const { queuePendingOperation } = await loadStoreModule();

    await queuePendingOperation(buildAppointmentStatusOperation('tech-b'));

    const deleteCall = databaseMock.runAsync.mock.calls[0];
    expect(deleteCall?.[0]).toContain('owner_employee_id = $ownerEmployeeId');
    expect(deleteCall?.[1]).toMatchObject({
      $entityKey: 'appointment:appointment-1',
      $ownerEmployeeId: 'tech-b'
    });

    const insertCall = databaseMock.runAsync.mock.calls[1];
    expect(insertCall?.[0]).toContain('owner_employee_id');
    expect(insertCall?.[1]).toMatchObject({
      $id: 'appointment-1-status',
      $ownerEmployeeId: 'tech-b'
    });
  });

  it('loads only pending operations owned by the current technician', async () => {
    const { loadPendingOperations } = await loadStoreModule();
    databaseMock.getAllAsync.mockResolvedValue([
      {
        id: 'note-1',
        owner_employee_id: 'tech-a',
        state: 'pending',
        last_result_message: null,
        payload_json: JSON.stringify({
          id: 'note-1',
          kind: 'jobNote',
          jobId: 'job-1',
          note: 'Saved locally',
          occurredAt,
          state: 'pending'
        })
      }
    ]);

    const operations = await loadPendingOperations('tech-a');

    expect(databaseMock.getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining('where owner_employee_id = $ownerEmployeeId'),
      { $ownerEmployeeId: 'tech-a' }
    );
    expect(operations).toEqual([
      expect.objectContaining({
        id: 'note-1',
        ownerEmployeeId: 'tech-a',
        state: 'pending'
      })
    ]);
  });

  it('adopts legacy ownerless rows to the current technician on first init', async () => {
    const { adoptLegacyPendingOperationsForEmployee } = await loadStoreModule();
    databaseMock.getAllAsync.mockResolvedValue([
      {
        id: 'note-1',
        owner_employee_id: null,
        state: 'pending',
        last_result_message: null,
        payload_json: JSON.stringify({
          id: 'note-1',
          kind: 'jobNote',
          jobId: 'job-1',
          note: 'Legacy local note',
          occurredAt,
          state: 'pending'
        })
      }
    ]);

    await expect(adoptLegacyPendingOperationsForEmployee('tech-a')).resolves.toBe(1);

    const updateCall = databaseMock.runAsync.mock.calls[0];
    expect(updateCall?.[0]).toContain('owner_employee_id is null');
    expect(updateCall?.[1]).toMatchObject({
      $ownerEmployeeId: 'tech-a',
      $operationId: 'note-1'
    });
    expect(JSON.parse(updateCall?.[1].$payloadJson)).toMatchObject({
      id: 'note-1',
      ownerEmployeeId: 'tech-a'
    });
  });

  it('clears disposable caches when their owner differs from the current technician', async () => {
    const { prepareFieldSyncStoreForEmployee } = await loadStoreModule();
    databaseMock.getAllAsync.mockImplementation(async (sql: string) => {
      if (sql.includes('pragma table_info')) {
        return [{ name: 'owner_employee_id' }];
      }

      return [];
    });
    databaseMock.getFirstAsync.mockResolvedValue({ employee_id: 'tech-a' });

    const result = await prepareFieldSyncStoreForEmployee('tech-b');

    expect(result).toMatchObject({
      adoptedLegacyPendingOperationCount: 0,
      clearedDisposableCaches: true
    });
    expect(
      databaseMock.execAsync.mock.calls.some((call) =>
        String(call[0]).includes('delete from assigned_work_snapshot')
      )
    ).toBe(true);
    expect(
      databaseMock.runAsync.mock.calls.some((call) =>
        String(call[0]).includes('field_local_cache_owner')
      )
    ).toBe(true);
  });
});
