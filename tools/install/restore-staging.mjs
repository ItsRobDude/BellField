import { copyFileSync, cpSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
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
