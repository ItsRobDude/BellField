import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import type { AssignedWorkSnapshot, PendingOperation, PendingOperationState, SyncMetadata } from './field-sync-types';

const databaseName = 'bellfield-field.db';

const defaultSyncMetadata: SyncMetadata = {
  lastSuccessfulSyncAt: null,
  lastAttemptedSyncAt: null,
  lastSnapshotVersion: null,
  lastSyncError: null
};

let databasePromise: Promise<SQLiteDatabase> | null = null;

function getEntityKey(operation: PendingOperation): string {
  if (operation.kind === 'appointmentStatus' || operation.kind === 'appointmentFinishReview') {
    return `appointment:${operation.appointmentId}`;
  }

  if (operation.kind === 'equipmentUpdate') {
    return `equipment:${operation.equipmentId}`;
  }

  return `job-note:${operation.id}`;
}

async function getDatabase(): Promise<SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = openDatabaseAsync(databaseName);
  }

  return databasePromise;
}

export async function initializeFieldSyncStore(): Promise<void> {
  const database = await getDatabase();

  await database.execAsync(`
    create table if not exists assigned_work_snapshot (
      id integer primary key check (id = 1),
      payload_json text not null,
      updated_at text not null
    );

    create table if not exists pending_operations (
      id text primary key,
      kind text not null,
      entity_key text not null,
      state text not null,
      payload_json text not null,
      created_at text not null,
      updated_at text not null,
      last_result_message text
    );

    create table if not exists sync_metadata (
      id integer primary key check (id = 1),
      payload_json text not null,
      updated_at text not null
    );

    create index if not exists pending_operations_entity_key_idx on pending_operations(entity_key);
    create index if not exists pending_operations_state_idx on pending_operations(state);
  `);
}

export async function loadAssignedWorkSnapshot(): Promise<AssignedWorkSnapshot | null> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ payload_json: string }>(
    'select payload_json from assigned_work_snapshot where id = 1'
  );

  if (!row) {
    return null;
  }

  return JSON.parse(row.payload_json) as AssignedWorkSnapshot;
}

export async function saveAssignedWorkSnapshot(snapshot: AssignedWorkSnapshot): Promise<void> {
  const database = await getDatabase();
  const now = new Date().toISOString();

  await database.runAsync(
    `
      insert into assigned_work_snapshot (id, payload_json, updated_at)
      values (1, $payloadJson, $updatedAt)
      on conflict(id) do update set
        payload_json = excluded.payload_json,
        updated_at = excluded.updated_at
    `,
    {
      $payloadJson: JSON.stringify(snapshot),
      $updatedAt: now
    }
  );
}

export async function loadPendingOperations(): Promise<PendingOperation[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{
    payload_json: string;
    state: PendingOperationState;
    last_result_message: string | null;
  }>('select payload_json, state, last_result_message from pending_operations order by created_at asc');

  return rows.map((row): PendingOperation => {
    const storedOperation = JSON.parse(row.payload_json) as PendingOperation;

    return {
      ...storedOperation,
      state: row.state,
      lastResultMessage: row.last_result_message ?? undefined
    };
  });
}

export async function queuePendingOperation(operation: PendingOperation): Promise<void> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  const entityKey = getEntityKey(operation);

  if (operation.kind !== 'jobNote') {
    await database.runAsync('delete from pending_operations where entity_key = $entityKey', {
      $entityKey: entityKey,
    });
  }

  await database.runAsync(
    `
      insert into pending_operations (
        id,
        kind,
        entity_key,
        state,
        payload_json,
        created_at,
        updated_at,
        last_result_message
      )
      values ($id, $kind, $entityKey, $state, $payloadJson, $createdAt, $updatedAt, $lastResultMessage)
    `,
    {
      $id: operation.id,
      $kind: operation.kind,
      $entityKey: entityKey,
      $state: operation.state,
      $payloadJson: JSON.stringify(operation),
      $createdAt: operation.occurredAt,
      $updatedAt: now,
      $lastResultMessage: operation.lastResultMessage ?? null
    }
  );
}

export async function updatePendingOperationState(
  operationId: string,
  state: PendingOperationState,
  lastResultMessage?: string
): Promise<void> {
  const database = await getDatabase();
  const existingRow = await database.getFirstAsync<{ payload_json: string }>(
    'select payload_json from pending_operations where id = $operationId',
    { $operationId: operationId }
  );

  if (!existingRow) {
    return;
  }

  const existingOperation = JSON.parse(existingRow.payload_json) as PendingOperation;
  const nextOperation: PendingOperation = {
    ...existingOperation,
    state,
    lastResultMessage
  };

  await database.runAsync(
    `
      update pending_operations
      set
        state = $state,
        payload_json = $payloadJson,
        updated_at = $updatedAt,
        last_result_message = $lastResultMessage
      where id = $operationId
    `,
    {
      $state: state,
      $payloadJson: JSON.stringify(nextOperation),
      $updatedAt: new Date().toISOString(),
      $lastResultMessage: lastResultMessage ?? null,
      $operationId: operationId
    }
  );
}

export async function removePendingOperation(operationId: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('delete from pending_operations where id = $operationId', {
    $operationId: operationId
  });
}

export async function loadSyncMetadata(): Promise<SyncMetadata> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ payload_json: string }>(
    'select payload_json from sync_metadata where id = 1'
  );

  if (!row) {
    return defaultSyncMetadata;
  }

  return {
    ...defaultSyncMetadata,
    ...(JSON.parse(row.payload_json) as Partial<SyncMetadata>)
  };
}

export async function saveSyncMetadata(metadata: SyncMetadata): Promise<void> {
  const database = await getDatabase();
  const now = new Date().toISOString();

  await database.runAsync(
    `
      insert into sync_metadata (id, payload_json, updated_at)
      values (1, $payloadJson, $updatedAt)
      on conflict(id) do update set
        payload_json = excluded.payload_json,
        updated_at = excluded.updated_at
    `,
    {
      $payloadJson: JSON.stringify(metadata),
      $updatedAt: now
    }
  );
}
