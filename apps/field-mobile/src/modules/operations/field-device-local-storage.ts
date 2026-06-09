import { clearStagedFieldMediaDirectory } from './field-media-capture';
import { clearFieldSyncStore } from './field-sync-store';

export async function clearFieldDeviceLocalStorage(): Promise<void> {
  await clearFieldSyncStore();

  // The SQLite queue is the source of truth for pending media references. Once it is cleared,
  // staged files should be removed too, but a filesystem cleanup miss should not keep a revoked
  // session on screen with assigned-work data still visible.
  await clearStagedFieldMediaDirectory().catch(() => undefined);
}
