import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync
} from 'node:fs';
import { basename, dirname, join } from 'node:path';

export function timestampForRestorePath(date = new Date()) {
  return date
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replaceAll(':', '')
    .replaceAll('-', '')
    .replace('T', '-');
}

export function stageDirectoryRestore(input) {
  assertDirectory(input.sourcePath, input.sourceLabel ?? 'restore source directory');
  const stagePath = uniqueSiblingPath(input.targetPath, 'restore-stage', input.stamp);

  try {
    mkdirSync(dirname(stagePath), { recursive: true });
    cpSync(input.sourcePath, stagePath, { recursive: true });
    return stagePath;
  } catch (error) {
    rmSync(stagePath, { force: true, recursive: true });
    throw error;
  }
}

export function swapStagedDirectory(input) {
  assertDirectory(input.stagePath, 'staged restore directory');
  mkdirSync(dirname(input.targetPath), { recursive: true });

  const rollbackPath = existsSync(input.targetPath)
    ? uniqueSiblingPath(input.targetPath, 'restore-rollback', input.stamp)
    : null;

  if (rollbackPath) {
    renameSync(input.targetPath, rollbackPath);
  }

  try {
    renameSync(input.stagePath, input.targetPath);
    return rollbackPath;
  } catch (error) {
    if (rollbackPath && existsSync(rollbackPath) && !existsSync(input.targetPath)) {
      renameSync(rollbackPath, input.targetPath);
    }
    throw error;
  }
}

export async function swapStagedDirectoryWithRetry(input) {
  const timeoutMs = input.timeoutMs ?? 60_000;
  const retryDelayMs = input.retryDelayMs ?? 1_000;
  const swapOnce = input.swapOnce ?? swapStagedDirectory;
  const warn = input.warn ?? ((message) => console.warn(message));
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;
  let lastError;
  let lastEvidence;

  while (Date.now() <= deadline) {
    attempt += 1;
    try {
      return swapOnce({
        stagePath: input.stagePath,
        targetPath: input.targetPath,
        stamp: input.stamp
      });
    } catch (error) {
      lastError = error;
      const rollbackRepair = restoreMissingTargetFromRollback({
        targetPath: input.targetPath,
        stamp: input.stamp
      });
      lastEvidence = buildSwapEvidence({
        input,
        attempt,
        error,
        rollbackRepair
      });
      if (rollbackRepair.restored) {
        warn(
          `Restored target from rollback after failed swap attempt ${attempt}: ${rollbackRepair.rollbackPath}`
        );
      }
      if (!existsSync(input.targetPath)) {
        throw createDirectorySwapError(
          `Directory swap failed and target could not be restored: ${
            error instanceof Error ? error.message : String(error)
          }`,
          error,
          lastEvidence
        );
      }
      if (!existsSync(input.stagePath)) {
        throw createDirectorySwapError(
          `Directory swap failed and staged directory is no longer available: ${
            error instanceof Error ? error.message : String(error)
          }`,
          error,
          lastEvidence
        );
      }
      if (!isRetryableSwapError(error) || Date.now() >= deadline) {
        throw createDirectorySwapError(
          `Directory swap failed after ${attempt} attempt(s): ${
            error instanceof Error ? error.message : String(error)
          }`,
          error,
          lastEvidence
        );
      }
      warn(
        `Directory swap attempt ${attempt} failed; retrying until ${new Date(deadline).toISOString()}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      await delay(retryDelayMs);
    }
  }

  throw createDirectorySwapError(
    `Directory swap timed out after ${timeoutMs}ms: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
    lastError,
    lastEvidence ??
      buildSwapEvidence({
        input,
        attempt,
        error: lastError,
        rollbackRepair: null
      })
  );
}

export function stageFileRestore(input) {
  assertFile(input.sourcePath, input.sourceLabel ?? 'restore source file');
  const stagePath = uniqueSiblingPath(input.targetPath, 'restore-stage', input.stamp);

  try {
    mkdirSync(dirname(stagePath), { recursive: true });
    copyFileSync(input.sourcePath, stagePath);
    return stagePath;
  } catch (error) {
    rmSync(stagePath, { force: true });
    throw error;
  }
}

export function swapStagedFile(input) {
  assertFile(input.stagePath, 'staged restore file');
  mkdirSync(dirname(input.targetPath), { recursive: true });

  const rollbackPath = existsSync(input.targetPath)
    ? uniqueSiblingPath(input.targetPath, 'restore-rollback', input.stamp)
    : null;

  if (rollbackPath) {
    renameSync(input.targetPath, rollbackPath);
  }

  try {
    renameSync(input.stagePath, input.targetPath);
    return rollbackPath;
  } catch (error) {
    if (rollbackPath && existsSync(rollbackPath) && !existsSync(input.targetPath)) {
      renameSync(rollbackPath, input.targetPath);
    }
    throw error;
  }
}

function uniqueSiblingPath(targetPath, kind, stamp = timestampForRestorePath()) {
  const parent = dirname(targetPath);
  const base = basename(targetPath);
  let candidate = join(parent, `${base}.${kind}-${stamp}`);
  let suffix = 2;

  while (existsSync(candidate)) {
    candidate = join(parent, `${base}.${kind}-${stamp}-${suffix}`);
    suffix += 1;
  }

  return candidate;
}

function restoreMissingTargetFromRollback({ targetPath, stamp }) {
  if (existsSync(targetPath)) {
    return { restored: false, reason: 'target exists' };
  }

  const rollbackPath = findRestorePathCandidate(targetPath, 'restore-rollback', stamp);
  if (!rollbackPath) {
    return { restored: false, reason: 'rollback not found' };
  }

  try {
    renameSync(rollbackPath, targetPath);
    return { restored: true, rollbackPath, rollbackCandidatePath: rollbackPath };
  } catch (error) {
    return {
      restored: false,
      reason: 'rollback restore failed',
      rollbackCandidatePath: rollbackPath,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function findRestorePathCandidate(targetPath, kind, stamp) {
  const parent = dirname(targetPath);
  const prefix = `${basename(targetPath)}.${kind}-${stamp}`;
  if (!existsSync(parent)) {
    return null;
  }

  const candidates = readdirSync(parent, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix))
    .map((entry) => {
      if (entry.name === prefix) {
        return { path: join(parent, entry.name), suffix: 1 };
      }
      const suffix = entry.name.slice(prefix.length + 1);
      return /^\d+$/.test(suffix)
        ? { path: join(parent, entry.name), suffix: Number(suffix) }
        : null;
    })
    .filter(Boolean)
    .sort((left, right) => right.suffix - left.suffix || right.path.localeCompare(left.path));
  return candidates[0]?.path ?? null;
}

function buildSwapEvidence({ input, attempt, error, rollbackRepair }) {
  return {
    attempts: attempt,
    stagePath: input.stagePath,
    targetPath: input.targetPath,
    stageExists: existsSync(input.stagePath),
    targetExists: existsSync(input.targetPath),
    rollbackCandidatePath:
      rollbackRepair?.rollbackCandidatePath ??
      rollbackRepair?.rollbackPath ??
      findRestorePathCandidate(input.targetPath, 'restore-rollback', input.stamp),
    rollbackRepair: rollbackRepair ?? { restored: false, reason: 'not attempted' },
    finalCause: error instanceof Error ? error.message : String(error)
  };
}

function createDirectorySwapError(message, cause, swapEvidence) {
  const error = new Error(message);
  if (cause) {
    error.cause = cause;
  }
  error.swapEvidence = swapEvidence;
  return error;
}

function isRetryableSwapError(error) {
  const code = typeof error?.code === 'string' ? error.code : '';
  const message = error instanceof Error ? error.message : String(error);
  return (
    ['EBUSY', 'EACCES', 'EPERM', 'ENOTEMPTY'].includes(code) ||
    /access is denied|being used by another process|resource busy|permission denied/i.test(message)
  );
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertDirectory(path, label) {
  if (!existsSync(path) || !statSync(path).isDirectory()) {
    throw new Error(`${label} is not a directory: ${path}`);
  }
}

function assertFile(path, label) {
  if (!existsSync(path) || !statSync(path).isFile()) {
    throw new Error(`${label} is not a file: ${path}`);
  }
}
