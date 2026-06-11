import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  stageDirectoryRestore,
  stageFileRestore,
  swapStagedDirectory,
  swapStagedFile
} from '../install/restore-staging.mjs';

const timestamp = new Date().toISOString();
const runId = timestamp.replace(/[:.]/g, '-');
const root = mkdtempSync(path.join(tmpdir(), 'bellfield-restore-staging-smoke-'));
const stamp = '20260611-restore-smoke';
const evidence = {
  name: 'Restore staging smoke',
  startedAt: timestamp,
  root,
  checks: []
};

try {
  const currentMediaRoot = path.join(root, 'data', 'media');
  const backupMediaRoot = path.join(root, 'backup', 'media');
  const currentLicensePath = path.join(root, 'data', 'license', 'bellfield-license.json');
  const backupLicensePath = path.join(root, 'backup', 'license', 'bellfield-license.json');

  mkdirSync(currentMediaRoot, { recursive: true });
  mkdirSync(backupMediaRoot, { recursive: true });
  mkdirSync(path.dirname(currentLicensePath), { recursive: true });
  mkdirSync(path.dirname(backupLicensePath), { recursive: true });
  writeFileSync(path.join(currentMediaRoot, 'old.txt'), 'old media', { flag: 'wx' });
  writeFileSync(path.join(backupMediaRoot, 'new.txt'), 'new media', { flag: 'wx' });
  writeFileSync(currentLicensePath, 'old license', { flag: 'wx' });
  writeFileSync(backupLicensePath, 'new license', { flag: 'wx' });

  const stagedMediaPath = stageDirectoryRestore({
    sourcePath: backupMediaRoot,
    targetPath: currentMediaRoot,
    stamp
  });
  const stagedLicensePath = stageFileRestore({
    sourcePath: backupLicensePath,
    targetPath: currentLicensePath,
    stamp
  });

  check('current media remains before swap', existsSync(path.join(currentMediaRoot, 'old.txt')));
  check('staged media has backup contents', existsSync(path.join(stagedMediaPath, 'new.txt')));

  const mediaRollbackPath = swapStagedDirectory({
    stagePath: stagedMediaPath,
    targetPath: currentMediaRoot,
    stamp
  });
  const licenseRollbackPath = swapStagedFile({
    stagePath: stagedLicensePath,
    targetPath: currentLicensePath,
    stamp
  });

  check(
    'media target contains backup copy after swap',
    existsSync(path.join(currentMediaRoot, 'new.txt'))
  );
  check(
    'media rollback preserves previous root',
    existsSync(path.join(mediaRollbackPath, 'old.txt'))
  );
  check(
    'license target contains backup copy after swap',
    readFileSync(currentLicensePath, 'utf8') === 'new license'
  );
  check(
    'license rollback preserves previous file',
    readFileSync(licenseRollbackPath, 'utf8') === 'old license'
  );

  evidence.mediaRollbackPath = mediaRollbackPath;
  evidence.licenseRollbackPath = licenseRollbackPath;
  evidence.completedAt = new Date().toISOString();
  evidence.result = 'passed';
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  evidence.completedAt = new Date().toISOString();
  evidence.result = 'failed';
  evidence.error = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify(evidence, null, 2));
  throw error;
} finally {
  rmSync(root, { force: true, recursive: true });
}

function check(name, passed) {
  evidence.checks.push({ name, passed });
  if (!passed) {
    throw new Error(name);
  }
}
