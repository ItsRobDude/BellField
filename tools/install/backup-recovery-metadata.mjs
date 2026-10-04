import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const releaseRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const sourceSettingsPath = join(releaseRoot, 'apps/worker/src/jobs/backup/recovery-settings.json');
const settingsPath = existsSync(sourceSettingsPath)
  ? sourceSettingsPath
  : join(releaseRoot, 'apps/worker/dist/jobs/backup/recovery-settings.json');
const settingTypes = JSON.parse(readFileSync(settingsPath, 'utf8'));

// The producer and installer share this allowlist, without importing worker runtime code.
export const recoverySettingNames = Object.freeze(Object.keys(settingTypes));

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertKeys(value, keys, label) {
  if (!isRecord(value) || Object.keys(value).some((key) => !keys.includes(key))) {
    throw new Error(`Invalid ${label} in backup recovery metadata.`);
  }
}

function isNonblankString(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.trim() === value &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validateApplication(value) {
  if (value?.status === 'unknown') {
    assertKeys(value, ['status', 'reason'], 'application identity');
    if (!['manifest-missing', 'manifest-invalid'].includes(value.reason)) {
      throw new Error('Invalid unknown application reason in backup recovery metadata.');
    }
    return { status: 'unknown', reason: value.reason };
  }
  assertKeys(
    value,
    ['status', 'buildKind', 'version', 'releaseDate', 'generatedAt', 'sourceCommit'],
    'application identity'
  );
  if (
    value.status !== 'known' ||
    !['source', 'release'].includes(value.buildKind) ||
    !isNonblankString(value.version) ||
    !isIsoDate(value.releaseDate) ||
    !isNonblankString(value.generatedAt) ||
    !Number.isFinite(Date.parse(value.generatedAt)) ||
    (value.sourceCommit !== null && !isNonblankString(value.sourceCommit))
  ) {
    throw new Error('Invalid application identity in backup recovery metadata.');
  }
  return { ...value };
}

function validUrl(value, originOnly = false) {
  if (!isNonblankString(value) || /[\s?#]/.test(value)) return false;
  try {
    const url = new URL(value);
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      (!originOnly || url.pathname === '/')
    );
  } catch {
    return false;
  }
}

function validSetting(value, type) {
  if (!isNonblankString(value)) return false;
  if (type === 'boolean') return value === 'true' || value === 'false';
  if (type === 'port' || type === 'positiveInteger') {
    const number = Number(value);
    return (
      /^[1-9]\d*$/.test(value) &&
      Number.isSafeInteger(number) &&
      (type !== 'port' || number <= 65535)
    );
  }
  if (type === 'url') return validUrl(value);
  if (type === 'origins') return value.split(',').every((origin) => validUrl(origin, true));
  return false;
}

export function validateBackupRecoveryMetadata(manifest) {
  if (!isRecord(manifest) || manifest.schemaVersion !== 1) {
    throw new Error('Unsupported or malformed backup manifest; expected schemaVersion 1.');
  }
  // Legacy backups remain usable for data restore with an explicit unknown-release override.
  if (!Object.hasOwn(manifest, 'recovery')) return null;
  const recovery = manifest.recovery;
  assertKeys(recovery, ['schemaVersion', 'application', 'configuration'], 'recovery envelope');
  if (recovery.schemaVersion !== 1) {
    throw new Error('Unsupported backup recovery metadata schemaVersion; expected 1.');
  }
  const application = validateApplication(recovery.application);
  const configuration = recovery.configuration;
  assertKeys(configuration, ['status', 'settings', 'relayConfigured'], 'configuration');
  if (
    !['captured', 'partial'].includes(configuration.status) ||
    typeof configuration.relayConfigured !== 'boolean' ||
    !isRecord(configuration.settings)
  ) {
    throw new Error('Invalid configuration in backup recovery metadata.');
  }
  const settings = {};
  for (const [name, value] of Object.entries(configuration.settings)) {
    if (!Object.hasOwn(settingTypes, name) || !validSetting(value, settingTypes[name])) {
      // Never echo an imported value: it may contain a misplaced credential.
      throw new Error('Unsupported or invalid setting in backup recovery metadata.');
    }
    settings[name] = value;
  }
  return {
    schemaVersion: 1,
    application,
    configuration: {
      status: configuration.status,
      settings,
      relayConfigured: configuration.relayConfigured
    }
  };
}

export function readBackupRecoveryMetadata(backupSetPath) {
  const manifestPath = join(backupSetPath, 'manifest.json');
  if (!existsSync(manifestPath)) throw new Error('Backup set is missing manifest.json.');
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    throw new Error('Backup manifest.json could not be read as valid JSON.');
  }
  return validateBackupRecoveryMetadata(manifest);
}

export function readApplicationProvenance(manifestPath) {
  if (!existsSync(manifestPath)) return { status: 'unknown', reason: 'manifest-missing' };
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (
      !isRecord(manifest) ||
      manifest.schemaVersion !== 1 ||
      typeof manifest.licenseRequired !== 'boolean'
    ) {
      throw new Error('invalid manifest');
    }
    return validateApplication({
      status: 'known',
      buildKind: manifest.buildKind,
      version: manifest.version,
      releaseDate: manifest.releaseDate,
      generatedAt: manifest.generatedAt,
      sourceCommit: manifest.sourceCommit
    });
  } catch {
    return { status: 'unknown', reason: 'manifest-invalid' };
  }
}

export function checkRestoreReleaseCompatibility({
  source,
  destination,
  allowReleaseMismatch = false,
  allowUnknownRelease = false
}) {
  const checkedSource = source === null ? null : validateApplication(source);
  const checkedDestination = validateApplication(destination);
  if (checkedSource?.status !== 'known' || checkedDestination.status !== 'known') {
    if (!allowUnknownRelease) {
      throw new Error(
        'Restore release identity is unknown. Independently verify the backup and destination release before passing --allow-unknown-release=true. This flag does not bypass malformed recovery metadata.'
      );
    }
    return 'unknown-release-allowed';
  }
  const matches = ['buildKind', 'version', 'sourceCommit'].every(
    (key) => checkedSource[key] === checkedDestination[key]
  );
  if (!matches) {
    if (!allowReleaseMismatch) {
      throw new Error(
        'Backup and destination release identities do not match. Use the matching release, or independently verify the migration path before passing --allow-release-mismatch=true.'
      );
    }
    return 'release-mismatch-allowed';
  }
  return 'matching';
}
