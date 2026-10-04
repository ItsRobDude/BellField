import { join, resolve } from 'node:path';
import { recoverySettingNames } from './backup-recovery-metadata.mjs';

// Manual backups and service backups must describe the same unified config.
// Empty entries mask unrelated values inherited from an operator's shell.
export function createBackupSourceEnv(serverEnv, sourceReleaseRoot) {
  return {
    ...Object.fromEntries(recoverySettingNames.map((name) => [name, serverEnv[name] ?? ''])),
    // Keep the runtime relay triple together; these two values are never backup metadata.
    BELLFIELD_RELAY_TOKEN: serverEnv.BELLFIELD_RELAY_TOKEN ?? '',
    BELLFIELD_RELAY_SERVER_INSTANCE_ID: serverEnv.BELLFIELD_RELAY_SERVER_INSTANCE_ID ?? '',
    BELLFIELD_BACKUP_CONFIG_COMPLETE: 'true',
    BELLFIELD_BUILD_MANIFEST_PATH: join(resolve(sourceReleaseRoot), 'bellfield-build-manifest.json')
  };
}
