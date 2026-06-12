import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

type NodeEnvironment = 'development' | 'test' | 'production';

const defaultDatabaseUrl = 'postgresql://postgres:postgres@localhost:5432/bellfield';
const defaultBackupIntervalMinutes = 24 * 60;
const defaultBackupRetentionCount = 7;
const defaultBackupStaleAfterHours = 36;

function getNodeEnv(value: string | undefined): NodeEnvironment {
  if (value === 'test' || value === 'production') {
    return value;
  }

  return 'development';
}

function getBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  return defaultValue;
}

function getPositiveInteger(
  name: string,
  defaultValue: number,
  isProduction: boolean,
  problems: string[]
): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return defaultValue;
  }

  const parsed = Number(raw);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }

  if (isProduction) {
    problems.push(`${name} must be a positive integer; received ${JSON.stringify(raw)}.`);
  }
  return defaultValue;
}

export type WorkerRelayConfig = {
  baseUrl: string;
  token: string;
  serverInstanceId: string;
};

export type WorkerRuntimeConfig = {
  nodeEnv: NodeEnvironment;
  databaseUrl: string;
  mediaRoot: string;
  licensePath?: string;
  backup: {
    enabled: boolean;
    root: string;
    intervalMs: number;
    retentionCount: number;
    staleAfterHours: number;
    postgresBin?: string;
    pgDumpPath?: string;
  };
  /** Delivery relay client; absent means delivery retry/status jobs stay off. */
  relay?: WorkerRelayConfig;
  delivery: {
    retryIntervalMs: number;
    statusIntervalMs: number;
    acceptanceDecisionsIntervalMs: number;
  };
};

export function getWorkerRuntimeConfig(): WorkerRuntimeConfig {
  const nodeEnv = getNodeEnv(process.env.NODE_ENV);
  const isProduction = nodeEnv === 'production';
  const problems: string[] = [];

  const configuredDatabaseUrl = process.env.DATABASE_URL?.trim();
  const databaseUrl = configuredDatabaseUrl || defaultDatabaseUrl;
  if (isProduction && !configuredDatabaseUrl) {
    problems.push('DATABASE_URL must be set for the BellField worker.');
  }

  const configuredMediaRoot = process.env.BELLFIELD_MEDIA_ROOT?.trim();
  const mediaRoot = resolve(configuredMediaRoot || join(tmpdir(), 'bellfield-media-dev'));
  if (isProduction && !configuredMediaRoot) {
    problems.push('BELLFIELD_MEDIA_ROOT must be set so backups include media files.');
  }

  const backupEnabled = getBoolean(process.env.BELLFIELD_BACKUP_ENABLED, true);
  const configuredLicensePath = process.env.BELLFIELD_LICENSE_PATH?.trim();
  const configuredBackupRoot = process.env.BELLFIELD_BACKUP_ROOT?.trim();
  const backupRoot = resolve(configuredBackupRoot || join(tmpdir(), 'bellfield-backups-dev'));
  if (isProduction && backupEnabled && !configuredBackupRoot) {
    problems.push('BELLFIELD_BACKUP_ROOT must be set for scheduled backups.');
  }

  const backupIntervalMinutes = getPositiveInteger(
    'BELLFIELD_BACKUP_INTERVAL_MINUTES',
    defaultBackupIntervalMinutes,
    isProduction,
    problems
  );
  const retentionCount = getPositiveInteger(
    'BELLFIELD_BACKUP_RETENTION_COUNT',
    defaultBackupRetentionCount,
    isProduction,
    problems
  );
  const staleAfterHours = getPositiveInteger(
    'BELLFIELD_BACKUP_STALE_AFTER_HOURS',
    defaultBackupStaleAfterHours,
    isProduction,
    problems
  );

  const relay = resolveRelayConfig(isProduction, problems);
  const deliveryRetryIntervalSeconds = getPositiveInteger(
    'BELLFIELD_DELIVERY_RETRY_INTERVAL_SECONDS',
    60,
    isProduction,
    problems
  );
  const deliveryStatusIntervalMinutes = getPositiveInteger(
    'BELLFIELD_DELIVERY_STATUS_INTERVAL_MINUTES',
    5,
    isProduction,
    problems
  );
  const acceptanceDecisionsIntervalSeconds = getPositiveInteger(
    'BELLFIELD_ACCEPTANCE_DECISIONS_INTERVAL_SECONDS',
    60,
    isProduction,
    problems
  );

  if (problems.length > 0) {
    throw new Error(
      [
        `BellField worker cannot start: ${problems.length} configuration problem(s) found.`,
        ...problems.map((problem) => `  - ${problem}`),
        'See bellfield-server.env.example for the required production settings.'
      ].join('\n')
    );
  }

  return {
    nodeEnv,
    databaseUrl,
    mediaRoot,
    licensePath: configuredLicensePath ? resolve(configuredLicensePath) : undefined,
    backup: {
      enabled: backupEnabled,
      root: backupRoot,
      intervalMs: backupIntervalMinutes * 60_000,
      retentionCount,
      staleAfterHours,
      postgresBin: process.env.BELLFIELD_POSTGRES_BIN?.trim() || undefined,
      pgDumpPath: process.env.BELLFIELD_PG_DUMP_PATH?.trim() || undefined
    },
    relay,
    delivery: {
      retryIntervalMs: deliveryRetryIntervalSeconds * 1_000,
      statusIntervalMs: deliveryStatusIntervalMinutes * 60_000,
      acceptanceDecisionsIntervalMs: acceptanceDecisionsIntervalSeconds * 1_000
    }
  };
}

/**
 * Mirrors the API's relay client config rules: all three values or none;
 * a partial set is a misconfiguration reported in production.
 */
function resolveRelayConfig(
  isProduction: boolean,
  problems: string[]
): WorkerRelayConfig | undefined {
  const baseUrl = process.env.BELLFIELD_RELAY_BASE_URL?.trim().replace(/\/+$/, '');
  const token = process.env.BELLFIELD_RELAY_TOKEN?.trim();
  const serverInstanceId = process.env.BELLFIELD_RELAY_SERVER_INSTANCE_ID?.trim();

  if (!baseUrl && !token && !serverInstanceId) {
    return undefined;
  }
  if (!baseUrl || !token || !serverInstanceId) {
    if (isProduction) {
      problems.push(
        'BELLFIELD_RELAY_BASE_URL, BELLFIELD_RELAY_TOKEN, and BELLFIELD_RELAY_SERVER_INSTANCE_ID must all be set together (or all left empty).'
      );
    }
    return undefined;
  }
  return { baseUrl, token, serverInstanceId };
}
