import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  assertReleaseWithinUpdateWindow,
  defaultReleasePrivateKeyPath,
  updateManifestFilename,
  updateSignatureFilename,
  verifyReleaseArtifact,
  writeSignedReleaseArtifact
} from '../update/release-artifact.mjs';

const root = mkdtempSync(path.join(tmpdir(), 'bellfield-release-signature-smoke-'));
const privateKeyPath = getArgValue('--private-key') || defaultReleasePrivateKeyPath;
const releaseRoot = path.join(root, 'release');
const evidence = {
  name: 'Release artifact signature smoke',
  startedAt: new Date().toISOString(),
  checks: []
};

try {
  check('private release signing key exists outside repo', existsSync(privateKeyPath), {
    privateKeyPath
  });
  writeFixtureRelease(releaseRoot);

  const signed = writeSignedReleaseArtifact({
    releaseRoot,
    privateKeyPath,
    now: new Date('2026-06-11T00:00:00.000Z')
  });
  check('signed update manifest exists', existsSync(signed.manifestPath), {
    manifestPath: signed.manifestPath
  });
  check('update signature exists', existsSync(signed.signaturePath), {
    signaturePath: signed.signaturePath
  });

  const verified = verifyReleaseArtifact({ releaseRoot });
  check('signed release verifies with embedded public key', verified.build.version === '1.2.3', {
    version: verified.build.version
  });

  assertReleaseWithinUpdateWindow({
    releaseDate: verified.build.releaseDate,
    updateWindowEnd: '2026-06-11'
  });
  check('same-day update window accepts release date', true);

  let refusedExpiredWindow = false;
  try {
    assertReleaseWithinUpdateWindow({
      releaseDate: verified.build.releaseDate,
      updateWindowEnd: '2026-06-10'
    });
  } catch {
    refusedExpiredWindow = true;
  }
  check('expired update window refuses release date', refusedExpiredWindow);

  writeFileSync(path.join(releaseRoot, 'apps', 'api', 'dist', 'main.js'), 'tampered', 'utf8');
  let refusedTamper = false;
  try {
    verifyReleaseArtifact({ releaseRoot });
  } catch {
    refusedTamper = true;
  }
  check('tampered artifact fails verification', refusedTamper);

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

function writeFixtureRelease(target) {
  mkdirSync(path.join(target, 'apps', 'api', 'dist'), { recursive: true });
  writeFileSync(
    path.join(target, 'bellfield-build-manifest.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        buildKind: 'release',
        licenseRequired: true,
        version: '1.2.3',
        releaseDate: '2026-06-11',
        generatedAt: '2026-06-11T00:00:00.000Z',
        sourceCommit: 'abc1234'
      },
      null,
      2
    )}\n`,
    { flag: 'wx' }
  );
  writeFileSync(path.join(target, 'apps', 'api', 'dist', 'main.js'), 'console.log("api");', {
    flag: 'wx'
  });
  writeFileSync(
    path.join(target, updateManifestFilename),
    '{"old":"manifest should be overwritten"}',
    { flag: 'w' }
  );
  writeFileSync(
    path.join(target, updateSignatureFilename),
    '{"old":"signature should be overwritten"}',
    { flag: 'w' }
  );
}

function getArgValue(name) {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

function check(name, passed, details = {}) {
  evidence.checks.push({ name, passed, details });
  if (!passed) {
    throw new Error(name);
  }
}
