import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export function defaultUpdateLockPath(installRoot) {
  return join(resolve(installRoot), 'data', 'locks', 'update.lock');
}

export function acquireUpdateLock(input) {
  const lockPath = resolve(input.lockPath ?? defaultUpdateLockPath(input.installRoot));
  const ownerToken = input.ownerToken ?? randomUUID();
  const processId = Number(input.processId ?? process.pid);
  const startedAt = (input.now ?? new Date()).toISOString();
  const isProcessAlive = input.isProcessAlive ?? defaultIsProcessAlive;
  const commandLine = input.commandLine ?? process.argv.join(' ');

  mkdirSync(dirname(lockPath), { recursive: true });

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      mkdirSync(lockPath);
      const owner = {
        schemaVersion: 1,
        ownerToken,
        processId,
        startedAt,
        commandLine
      };
      writeFileSync(join(lockPath, 'owner.json'), `${JSON.stringify(owner, null, 2)}\n`, {
        flag: 'wx'
      });
      return createLockHandle({ lockPath, ownerToken });
    } catch (error) {
      if (error?.code !== 'EEXIST') {
        throw error;
      }

      const existingOwner = readUpdateLockOwner(lockPath);
      if (existingOwner?.processId && isProcessAlive(Number(existingOwner.processId))) {
        throw createUpdateLockError(lockPath, existingOwner);
      }

      removeStaleLock(lockPath);
    }
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

function removeStaleLock(lockPath) {
  rmSync(lockPath, { force: true, recursive: true, maxRetries: 10, retryDelay: 100 });
}

function createUpdateLockError(lockPath, owner) {
  const error = new Error(
    [
      `Another BellField update appears to be running. Active lock: ${lockPath}.`,
      `Owner PID: ${owner.processId ?? '<unknown>'}.`,
      `Started: ${owner.startedAt ?? '<unknown>'}.`,
      'Wait for that updater to finish or inspect the process before retrying.'
    ].join(' ')
  );
  error.code = 'BELLFIELD_UPDATE_LOCKED';
  error.lockPath = lockPath;
  error.lockOwner = owner;
  return error;
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
