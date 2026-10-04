import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import recoverySettings from './recovery-settings.json';

export type BackupApplicationMetadata =
  | {
      status: 'known';
      buildKind: 'source' | 'release';
      version: string;
      releaseDate: string;
      generatedAt: string;
      sourceCommit: string | null;
    }
  | { status: 'unknown'; reason: 'manifest-missing' | 'manifest-invalid' };

export type BackupRecoveryMetadata = {
  schemaVersion: 1;
  application: BackupApplicationMetadata;
  configuration: {
    status: 'captured' | 'partial';
    settings: Record<string, string>;
    relayConfigured: boolean;
  };
};

export function createBackupRecoveryMetadata(
  input: { env?: NodeJS.ProcessEnv; moduleDirectory?: string } = {}
): BackupRecoveryMetadata {
  const env = input.env ?? process.env;
  const settings: Record<string, string> = {};
  let complete = env.BELLFIELD_BACKUP_CONFIG_COMPLETE === 'true';

  for (const [name, type] of Object.entries(recoverySettings)) {
    const raw = env[name]?.trim();
    if (!raw) continue;
    const value = normalizeSetting(raw, type);
    if (value === null) {
      complete = false;
      continue;
    }
    settings[name] = value;
  }

  return {
    schemaVersion: 1,
    application: readApplicationMetadata(env, input.moduleDirectory ?? __dirname),
    configuration: {
      status: complete ? 'captured' : 'partial',
      settings,
      relayConfigured: Boolean(
        env.BELLFIELD_RELAY_BASE_URL?.trim() && env.BELLFIELD_RELAY_TOKEN?.trim()
      )
    }
  };
}

function readApplicationMetadata(
  env: NodeJS.ProcessEnv,
  moduleDirectory: string
): BackupApplicationMetadata {
  // The updater runs the incoming backup CLI against the old database. Its
  // explicit source-manifest path must never fall back to the incoming release.
  const manifestPath =
    env.BELLFIELD_BUILD_MANIFEST_PATH?.trim() ||
    resolve(moduleDirectory, '..', '..', '..', '..', '..', 'bellfield-build-manifest.json');
  if (!existsSync(manifestPath)) return { status: 'unknown', reason: 'manifest-missing' };

  try {
    const value: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (
      !isRecord(value) ||
      value.schemaVersion !== 1 ||
      (value.buildKind !== 'source' && value.buildKind !== 'release') ||
      typeof value.licenseRequired !== 'boolean' ||
      !isNonBlankString(value.version) ||
      !isIsoDate(value.releaseDate) ||
      !isNonBlankString(value.generatedAt) ||
      !Number.isFinite(Date.parse(value.generatedAt)) ||
      (value.sourceCommit !== null && !isNonBlankString(value.sourceCommit))
    ) {
      return { status: 'unknown', reason: 'manifest-invalid' };
    }
    return {
      status: 'known',
      buildKind: value.buildKind,
      version: value.version,
      releaseDate: value.releaseDate,
      generatedAt: value.generatedAt,
      sourceCommit: value.sourceCommit
    };
  } catch {
    // A damaged manifest must not prevent saving business data or leak its bytes.
    return { status: 'unknown', reason: 'manifest-invalid' };
  }
}

function normalizeSetting(value: string, type: string): string | null {
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  if (type === 'port' || type === 'positiveInteger') {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number <= 0 || (type === 'port' && number > 65535))
      return null;
    return String(number);
  }
  if (type === 'boolean') {
    const normalized = value.toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return 'true';
    if (['false', '0', 'no', 'off'].includes(normalized)) return 'false';
    return null;
  }
  if (type === 'url') return safeUrl(value, false);
  if (type === 'origins') {
    const origins = value.split(',').map((origin) => safeUrl(origin.trim(), true));
    return origins.every((origin) => origin !== null) ? origins.join(',') : null;
  }
  return null;
}

function safeUrl(value: string, originOnly: boolean): string | null {
  if (/[\s?#]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      !url.hostname ||
      url.username ||
      url.password ||
      value.includes('?') ||
      value.includes('#') ||
      (originOnly && url.pathname !== '/')
    )
      return null;
    return originOnly ? url.origin : value;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonBlankString(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.trim() === value &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
