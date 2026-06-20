import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import type {
  AssignedWorkSnapshot,
  OwnedPendingOperation,
  PendingOperation,
  PendingOperationState,
  SyncMetadata,
  TruckStockSnapshot
} from './field-sync-types';

const databaseName = 'bellfield-field.db';

const defaultSyncMetadata: SyncMetadata = {
  lastSuccessfulSyncAt: null,
  lastAttemptedSyncAt: null,
  lastSnapshotVersion: null,
  lastSyncError: null
};

let databasePromise: Promise<SQLiteDatabase> | null = null;

type TableColumnInfo = {
  name: string;
};

type PendingOperationRow = {
  id: string;
  payload_json: string;
  state: PendingOperationState;
  last_result_message: string | null;
  owner_employee_id: string | null;
};

function getEntityKey(operation: PendingOperation): string {
  if (operation.kind === 'appointmentStatus' || operation.kind === 'appointmentFinishReview') {
    return `appointment:${operation.appointmentId}`;
  }

  if (operation.kind === 'equipmentUpdate') {
    return `equipment:${operation.equipmentId}`;
  }

  if (operation.kind === 'registerEntryEdit' || operation.kind === 'registerEntryVoid') {
    return `register-entry:${operation.registerEntryId}`;
  }

  if (operation.kind === 'registerEntryCreate') {
    return `register-entry-create:${operation.id}`;
  }

  if (operation.kind === 'mediaUpload') {
    return `media-upload:${operation.localMediaId}`;
  }

  return `job-note:${operation.id}`;
}

function shouldReplaceExistingOperation(operation: PendingOperation): boolean {
  return (
    operation.kind !== 'jobNote' &&
    operation.kind !== 'registerEntryCreate' &&
    operation.kind !== 'mediaUpload'
  );
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
      owner_employee_id text,
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

    create table if not exists truck_stock_snapshot (
      id integer primary key check (id = 1),
      payload_json text not null,
      updated_at text not null
    );

    create table if not exists field_local_cache_owner (
      id integer primary key check (id = 1),
      employee_id text not null,
      updated_at text not null
    );

    create index if not exists pending_operations_entity_key_idx on pending_operations(entity_key);
    create index if not exists pending_operations_state_idx on pending_operations(state);
  `);

  await ensurePendingOperationsOwnerColumn(database);
  await database.execAsync(
    'create index if not exists pending_operations_owner_idx on pending_operations(owner_employee_id);'
  );
}

export async function prepareFieldSyncStoreForEmployee(employeeId: string): Promise<{
  adoptedLegacyPendingOperationCount: number;
  clearedDisposableCaches: boolean;
}> {
  await initializeFieldSyncStore();
  const database = await getDatabase();
  const clearedDisposableCaches = await ensureDisposableCacheOwner(database, employeeId);
  const adoptedLegacyPendingOperationCount =
    await adoptLegacyPendingOperationsForEmployee(employeeId);

  return { adoptedLegacyPendingOperationCount, clearedDisposableCaches };
}

export async function clearFieldSyncStore(): Promise<void> {
  await initializeFieldSyncStore();
  const database = await getDatabase();

  await database.execAsync(`
    delete from assigned_work_snapshot;
    delete from pending_operations;
    delete from sync_metadata;
    delete from truck_stock_snapshot;
    delete from field_local_cache_owner;
  `);
}

export async function loadAssignedWorkSnapshot(
  ownerEmployeeId: string
): Promise<AssignedWorkSnapshot | null> {
  const database = await getDatabase();

  if (!(await isDisposableCacheOwnedBy(database, ownerEmployeeId))) {
    return null;
  }

  const row = await database.getFirstAsync<{ payload_json: string }>(
    'select payload_json from assigned_work_snapshot where id = 1'
  );

  if (!row) {
    return null;
  }

  return JSON.parse(row.payload_json) as AssignedWorkSnapshot;
}

export async function saveAssignedWorkSnapshot(
  snapshot: AssignedWorkSnapshot,
  ownerEmployeeId: string
): Promise<void> {
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

  await saveDisposableCacheOwner(database, ownerEmployeeId);
}

export async function loadTruckStockSnapshot(
  ownerEmployeeId: string
): Promise<TruckStockSnapshot | null> {
  const database = await getDatabase();

  if (!(await isDisposableCacheOwnedBy(database, ownerEmployeeId))) {
    return null;
  }

  const row = await database.getFirstAsync<{ payload_json: string }>(
    'select payload_json from truck_stock_snapshot where id = 1'
  );

  if (!row) {
    return null;
  }

  return JSON.parse(row.payload_json) as TruckStockSnapshot;
}

export async function saveTruckStockSnapshot(
  snapshot: TruckStockSnapshot,
  ownerEmployeeId: string
): Promise<void> {
  const database = await getDatabase();
  const now = new Date().toISOString();

  await database.runAsync(
    `
      insert into truck_stock_snapshot (id, payload_json, updated_at)
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

  await saveDisposableCacheOwner(database, ownerEmployeeId);
}

export async function loadPendingOperations(
  ownerEmployeeId: string
): Promise<OwnedPendingOperation[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<PendingOperationRow>(
    `
      select id, payload_json, state, last_result_message, owner_employee_id
      from pending_operations
      where owner_employee_id = $ownerEmployeeId
      order by created_at asc
    `,
    { $ownerEmployeeId: ownerEmployeeId }
  );

  return rows.map((row): OwnedPendingOperation => {
    const storedOperation = JSON.parse(row.payload_json) as PendingOperation;

    return {
      ...storedOperation,
      ownerEmployeeId: row.owner_employee_id ?? storedOperation.ownerEmployeeId ?? ownerEmployeeId,
      state: row.state,
      lastResultMessage: row.last_result_message ?? undefined
    };
  });
}

export async function queuePendingOperation(operation: OwnedPendingOperation): Promise<void> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  const entityKey = getEntityKey(operation);

  if (shouldReplaceExistingOperation(operation)) {
    await database.runAsync(
      `
        delete from pending_operations
        where entity_key = $entityKey
          and owner_employee_id = $ownerEmployeeId
      `,
      {
        $entityKey: entityKey,
        $ownerEmployeeId: operation.ownerEmployeeId
      }
    );
  }

  await database.runAsync(
    `
      insert into pending_operations (
        id,
        owner_employee_id,
        kind,
        entity_key,
        state,
        payload_json,
        created_at,
        updated_at,
        last_result_message
      )
      values (
        $id,
        $ownerEmployeeId,
        $kind,
        $entityKey,
        $state,
        $payloadJson,
        $createdAt,
        $updatedAt,
        $lastResultMessage
      )
    `,
    {
      $id: operation.id,
      $ownerEmployeeId: operation.ownerEmployeeId,
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
  ownerEmployeeId: string,
  state: PendingOperationState,
  lastResultMessage?: string
): Promise<void> {
  const database = await getDatabase();
  const existingRow = await database.getFirstAsync<{ payload_json: string }>(
    `
      select payload_json
      from pending_operations
      where id = $operationId
        and owner_employee_id = $ownerEmployeeId
    `,
    { $operationId: operationId, $ownerEmployeeId: ownerEmployeeId }
  );

  if (!existingRow) {
    return;
  }

  const existingOperation = JSON.parse(existingRow.payload_json) as PendingOperation;
  const nextOperation: OwnedPendingOperation = {
    ...existingOperation,
    ownerEmployeeId,
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
        and owner_employee_id = $ownerEmployeeId
    `,
    {
      $state: state,
      $payloadJson: JSON.stringify(nextOperation),
      $updatedAt: new Date().toISOString(),
      $lastResultMessage: lastResultMessage ?? null,
      $operationId: operationId,
      $ownerEmployeeId: ownerEmployeeId
    }
  );
}

export async function removePendingOperation(
  operationId: string,
  ownerEmployeeId: string
): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `
      delete from pending_operations
      where id = $operationId
        and owner_employee_id = $ownerEmployeeId
    `,
    {
      $operationId: operationId,
      $ownerEmployeeId: ownerEmployeeId
    }
  );
}

export async function loadSyncMetadata(ownerEmployeeId: string): Promise<SyncMetadata> {
  const database = await getDatabase();

  if (!(await isDisposableCacheOwnedBy(database, ownerEmployeeId))) {
    return defaultSyncMetadata;
  }

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

export async function saveSyncMetadata(
  metadata: SyncMetadata,
  ownerEmployeeId: string
): Promise<void> {
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

  await saveDisposableCacheOwner(database, ownerEmployeeId);
}

export async function adoptLegacyPendingOperationsForEmployee(
  ownerEmployeeId: string
): Promise<number> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<PendingOperationRow>(
    `
      select id, payload_json, state, last_result_message, owner_employee_id
      from pending_operations
      where owner_employee_id is null
      order by created_at asc
    `
  );

  for (const row of rows) {
    const operation = JSON.parse(row.payload_json) as PendingOperation;
    const nextOperation: OwnedPendingOperation = {
      ...operation,
      ownerEmployeeId,
      state: row.state,
      lastResultMessage: row.last_result_message ?? operation.lastResultMessage
    };

    await database.runAsync(
      `
        update pending_operations
        set
          owner_employee_id = $ownerEmployeeId,
          payload_json = $payloadJson,
          updated_at = $updatedAt
        where id = $operationId
          and owner_employee_id is null
      `,
      {
        $ownerEmployeeId: ownerEmployeeId,
        $payloadJson: JSON.stringify(nextOperation),
        $updatedAt: new Date().toISOString(),
        $operationId: row.id
      }
    );
  }

  return rows.length;
}

async function ensurePendingOperationsOwnerColumn(database: SQLiteDatabase): Promise<void> {
  const columns = await database.getAllAsync<TableColumnInfo>(
    'pragma table_info(pending_operations)'
  );
  const hasOwnerColumn = columns.some((column) => column.name === 'owner_employee_id');

  if (!hasOwnerColumn) {
    await database.execAsync('alter table pending_operations add column owner_employee_id text;');
  }
}

async function ensureDisposableCacheOwner(
  database: SQLiteDatabase,
  ownerEmployeeId: string
): Promise<boolean> {
  const currentOwner = await loadDisposableCacheOwner(database);

  if (!currentOwner) {
    await saveDisposableCacheOwner(database, ownerEmployeeId);
    return false;
  }

  if (currentOwner === ownerEmployeeId) {
    return false;
  }

  await clearDisposableCaches(database);
  await saveDisposableCacheOwner(database, ownerEmployeeId);
  return true;
}

async function isDisposableCacheOwnedBy(
  database: SQLiteDatabase,
  ownerEmployeeId: string
): Promise<boolean> {
  const currentOwner = await loadDisposableCacheOwner(database);
  return currentOwner === ownerEmployeeId;
}

async function loadDisposableCacheOwner(database: SQLiteDatabase): Promise<string | null> {
  const row = await database.getFirstAsync<{ employee_id: string }>(
    'select employee_id from field_local_cache_owner where id = 1'
  );

  return row?.employee_id ?? null;
}

async function saveDisposableCacheOwner(
  database: SQLiteDatabase,
  ownerEmployeeId: string
): Promise<void> {
  await database.runAsync(
    `
      insert into field_local_cache_owner (id, employee_id, updated_at)
      values (1, $employeeId, $updatedAt)
      on conflict(id) do update set
        employee_id = excluded.employee_id,
        updated_at = excluded.updated_at
    `,
    {
      $employeeId: ownerEmployeeId,
      $updatedAt: new Date().toISOString()
    }
  );
}

async function clearDisposableCaches(database: SQLiteDatabase): Promise<void> {
  await database.execAsync(`
    delete from assigned_work_snapshot;
    delete from sync_metadata;
    delete from truck_stock_snapshot;
    delete from field_local_cache_owner;
  `);
}
