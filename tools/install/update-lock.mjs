import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const defaultUpdateLockMaxAgeMs = 2 * 60 * 60 * 1000;
export const defaultUpdateLockOwnerlessGraceMs = 30_000;

export function defaultUpdateLockPath(installRoot) {
  return join(resolve(installRoot), 'data', 'locks', 'update.lock');
}

export function acquireUpdateLock(input) {
  const lockPath = resolve(input.lockPath ?? defaultUpdateLockPath(input.installRoot));
  const ownerToken = input.ownerToken ?? randomUUID();
  const processId = Number(input.processId ?? process.pid);
  const now = input.now ?? new Date();
  const startedAt = toDate(now).toISOString();
  const nowMs = toDate(now).getTime();
  const isProcessAlive = input.isProcessAlive ?? defaultIsProcessAlive;
  const getProcessSnapshot = input.getProcessSnapshot ?? (() => null);
  const maxAgeMs = Number(input.maxAgeMs ?? defaultUpdateLockMaxAgeMs);
  const ownerlessGraceMs = Number(input.ownerlessGraceMs ?? defaultUpdateLockOwnerlessGraceMs);
  const commandLine = input.commandLine ?? process.argv.join(' ');

  mkdirSync(dirname(lockPath), { recursive: true });

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      mkdirSync(lockPath);
    } catch (error) {
      if (error?.code !== 'EEXIST') {
        throw error;
      }

      const decision = inspectExistingLock({
        lockPath,
        nowMs,
        maxAgeMs,
        ownerlessGraceMs,
        isProcessAlive,
        getProcessSnapshot
      });
      if (decision.action === 'block') {
        throw createUpdateLockError(lockPath, decision.owner, decision);
      }

      removeStaleLockIfUnchanged(lockPath, decision.owner);
      continue;
    }

    const owner = {
      schemaVersion: 1,
      ownerToken,
      processId,
      startedAt,
      commandLine
    };

    try {
      writeFileSync(join(lockPath, 'owner.json'), `${JSON.stringify(owner, null, 2)}\n`, {
        flag: 'wx'
      });
    } catch (error) {
      rmSync(lockPath, { force: true, recursive: true, maxRetries: 10, retryDelay: 100 });
      throw error;
    }

    const verifiedOwner = readUpdateLockOwner(lockPath);
    if (verifiedOwner?.ownerToken !== ownerToken) {
      throw createUpdateLockError(lockPath, verifiedOwner, {
        reason: 'owner-verification-failed',
        requiresOperatorInspection: true
      });
    }

    return createLockHandle({ lockPath, ownerToken });
  }

  throw new Error(`Could not acquire BellField update lock at ${lockPath}.`);
}

export function readUpdateLockOwner(lockPath) {
  try {
    const ownerPath = join(resolve(lockPath), 'owner.json');
    if (!existsSync(ownerPath)) {
      return null;
    }
    const parsed = JSON.parse(readFileSync(ownerPath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function inspectExistingLock(input) {
  const owner = readUpdateLockOwner(input.lockPath);
  if (!owner?.ownerToken) {
    const lockAgeMs = ownerlessLockAgeMs(input.lockPath, input.nowMs);
    if (lockAgeMs !== null && lockAgeMs > input.ownerlessGraceMs) {
      return { action: 'remove', owner: null, reason: 'ownerless-lock-stale', lockAgeMs };
    }
    return {
      action: 'block',
      owner: null,
      reason: 'ownerless-lock-in-progress',
      lockAgeMs,
      requiresOperatorInspection: false
    };
  }

  const processId = Number(owner.processId);
  const lockAgeMs = ownerLockAgeMs(owner, input.nowMs);
  if (!Number.isInteger(processId) || processId <= 0) {
    return { action: 'remove', owner, reason: 'owner-process-invalid', lockAgeMs };
  }

  if (!input.isProcessAlive(processId)) {
    return { action: 'remove', owner, reason: 'owner-process-dead', lockAgeMs };
  }

  const processSnapshot = getProcessSnapshotSafe(input.getProcessSnapshot, processId);
  if (processSnapshot?.alive === false) {
    return { action: 'remove', owner, reason: 'owner-process-not-found', lockAgeMs };
  }

  const identity = classifyProcessIdentity(owner, processSnapshot);
  if (identity === 'mismatch') {
    return {
      action: 'remove',
      owner,
      reason: 'owner-process-identity-mismatch',
      lockAgeMs,
      processSnapshot
    };
  }

  const oldLiveLock = lockAgeMs !== null && lockAgeMs > input.maxAgeMs;
  return {
    action: 'block',
    owner,
    reason: oldLiveLock ? 'owner-process-still-appears-active' : 'owner-process-active',
    lockAgeMs,
    processSnapshot,
    requiresOperatorInspection: oldLiveLock
  };
}

function createLockHandle({ lockPath, ownerToken }) {
  let released = false;
  return {
    lockPath,
    release() {
      if (released) {
        return;
      }
      released = true;

      const owner = readUpdateLockOwner(lockPath);
      if (owner?.ownerToken && owner.ownerToken !== ownerToken) {
        return;
      }
      rmSync(lockPath, { force: true, recursive: true, maxRetries: 10, retryDelay: 100 });
    }
  };
}

function removeStaleLockIfUnchanged(lockPath, expectedOwner) {
  const currentOwner = readUpdateLockOwner(lockPath);
  if (!ownersMatch(currentOwner, expectedOwner)) {
    return false;
  }
  rmSync(lockPath, { force: true, recursive: true, maxRetries: 10, retryDelay: 100 });
  return true;
}

function createUpdateLockError(lockPath, owner, details = {}) {
  const manualRemediation = `After confirming no BellField update is running, delete ${lockPath} and retry.`;
  const error = new Error(
    [
      `Another BellField update appears to be running. Active lock: ${lockPath}.`,
      `Owner PID: ${owner?.processId ?? '<unknown>'}.`,
      `Started: ${owner?.startedAt ?? '<unknown>'}.`,
      'Wait for that updater to finish or inspect the process before retrying.',
      manualRemediation
    ].join(' ')
  );
  error.code = 'BELLFIELD_UPDATE_LOCKED';
  error.lockPath = lockPath;
  error.lockOwner = owner ?? null;
  error.reason = details.reason ?? 'owner-process-active';
  error.lockAgeMs = details.lockAgeMs ?? null;
  error.requiresOperatorInspection = Boolean(details.requiresOperatorInspection);
  error.processSnapshot = details.processSnapshot ?? null;
  error.manualRemediation = manualRemediation;
  return error;
}

function ownersMatch(left, right) {
  if (!left && !right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return (
    left.ownerToken === right.ownerToken &&
    Number(left.processId) === Number(right.processId) &&
    left.startedAt === right.startedAt
  );
}

function classifyProcessIdentity(owner, processSnapshot) {
  if (!processSnapshot || processSnapshot.alive === false) {
    return 'unknown';
  }

  const ownerCommandLine = normalizeCommandLine(owner.commandLine);
  const processCommandLine = normalizeCommandLine(processSnapshot.commandLine);
  if (!processCommandLine) {
    return 'unknown';
  }
  if (!ownerCommandLine) {
    return processCommandLine.includes('update-bellfield.mjs') ? 'unknown' : 'mismatch';
  }
  if (
    processCommandLine === ownerCommandLine ||
    processCommandLine.includes(ownerCommandLine) ||
    ownerCommandLine.includes(processCommandLine)
  ) {
    return 'match';
  }
  if (
    processCommandLine.includes('update-bellfield.mjs') &&
    ownerCommandLine.includes('update-bellfield.mjs')
  ) {
    return 'match';
  }
  return 'mismatch';
}

function normalizeCommandLine(value) {
  return typeof value === 'string'
    ? value.replaceAll('"', '').replaceAll("'", '').replace(/\s+/g, ' ').trim().toLowerCase()
    : '';
}

function getProcessSnapshotSafe(getProcessSnapshot, processId) {
  try {
    const snapshot = getProcessSnapshot(processId);
    return snapshot && typeof snapshot === 'object' ? snapshot : null;
  } catch {
    return null;
  }
}

function ownerLockAgeMs(owner, nowMs) {
  const startedAtMs = Date.parse(owner?.startedAt ?? '');
  return Number.isFinite(startedAtMs) ? Math.max(0, nowMs - startedAtMs) : null;
}

function ownerlessLockAgeMs(lockPath, nowMs) {
  try {
    return Math.max(0, nowMs - statSync(lockPath).mtimeMs);
  } catch {
    return null;
  }
}

function toDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error('Update lock time must be a valid Date or date-like value.');
  }
  return date;
}

function defaultIsProcessAlive(processId) {
  if (!Number.isInteger(processId) || processId <= 0) {
    return false;
  }
  try {
    process.kill(processId, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}
