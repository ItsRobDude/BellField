import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

export const releaseArtifactSignatureAlgorithm = 'Ed25519';
export const releaseArtifactKeyId = 'bellfield-release-v1';
export const updateManifestFilename = 'bellfield-update-manifest.json';
export const updateSignatureFilename = 'bellfield-update-signature.json';
export const defaultReleasePrivateKeyPath =
  'C:\\Users\\rober\\Documents\\API Keys\\BellField\\release-v1\\bellfield-release-private-key.pem';

const embeddedReleasePublicKeyPem = [
  '-----BEGIN PUBLIC KEY-----',
  'MCowBQYDK2VwAyEAwKannocnFGdelfSnXBlAlWw5xExJFYQK9PvZEQ+ilQ8=',
  '-----END PUBLIC KEY-----',
  ''
].join('\n');

export function writeSignedReleaseArtifact(input) {
  const releaseRoot = resolve(input.releaseRoot);
  const privateKeyPath = resolve(input.privateKeyPath ?? defaultReleasePrivateKeyPath);
  if (!existsSync(privateKeyPath)) {
    throw new Error(
      `Release signing private key was not found at ${privateKeyPath}. Generate it outside the repo before building a sold release.`
    );
  }

  const manifest = {
    schemaVersion: 1,
    artifactKind: 'bellfield-server-release',
    signedAt: (input.now ?? new Date()).toISOString(),
    build: readBuildManifest(releaseRoot),
    files: collectReleaseFiles(releaseRoot)
  };
  const privateKey = createPrivateKey(readFileSync(privateKeyPath, 'utf8'));
  const signature = sign(
    null,
    Buffer.from(canonicalizeJson(manifest), 'utf8'),
    privateKey
  ).toString('base64url');
  const signatureEnvelope = {
    schemaVersion: 1,
    signature: {
      algorithm: releaseArtifactSignatureAlgorithm,
      keyId: releaseArtifactKeyId,
      value: signature
    }
  };

  writeJson(join(releaseRoot, updateManifestFilename), manifest);
  writeJson(join(releaseRoot, updateSignatureFilename), signatureEnvelope);

  return {
    manifest,
    manifestPath: join(releaseRoot, updateManifestFilename),
    signaturePath: join(releaseRoot, updateSignatureFilename)
  };
}

export function verifyReleaseArtifact(input) {
  const releaseRoot = resolve(input.releaseRoot);
  const manifestPath = join(releaseRoot, updateManifestFilename);
  const signaturePath = join(releaseRoot, updateSignatureFilename);
  if (!existsSync(manifestPath) || !existsSync(signaturePath)) {
    throw new Error('Update artifact is missing its signed manifest files.');
  }

  const manifest = parseUpdateManifest(readJson(manifestPath), manifestPath);
  const signatureEnvelope = parseSignatureEnvelope(readJson(signaturePath), signaturePath);
  const publicKey = createPublicKey(input.publicKeyPem ?? embeddedReleasePublicKeyPem);
  const signatureOk = verify(
    null,
    Buffer.from(canonicalizeJson(manifest), 'utf8'),
    publicKey,
    Buffer.from(signatureEnvelope.signature.value, 'base64url')
  );
  if (!signatureOk) {
    throw new Error('Update artifact signature did not verify.');
  }

  const currentFiles = collectReleaseFiles(releaseRoot);
  const currentPaths = currentFiles.map((file) => file.path);
  const manifestPaths = manifest.files.map((file) => file.path);
  if (JSON.stringify(currentPaths) !== JSON.stringify(manifestPaths)) {
    throw new Error(
      [
        'Update artifact file list does not match its signed manifest.',
        summarizePathDelta(manifestPaths, currentPaths)
      ].join(' ')
    );
  }

  for (let index = 0; index < currentFiles.length; index += 1) {
    const current = currentFiles[index];
    const expected = manifest.files[index];
    if (current.bytes !== expected.bytes || current.sha256 !== expected.sha256) {
      throw new Error(`Update artifact file hash mismatch: ${current.path}`);
    }
  }

  const buildManifest = readBuildManifest(releaseRoot);
  if (canonicalizeJson(buildManifest) !== canonicalizeJson(manifest.build)) {
    throw new Error('Update artifact build manifest does not match its signed manifest.');
  }

  return manifest;
}

export function assertReleaseWithinUpdateWindow(input) {
  const releaseDate = assertIsoDate(input.releaseDate, 'releaseDate');
  const updateWindowEnd = assertIsoDate(input.updateWindowEnd, 'updateWindowEnd');

  if (releaseDate > updateWindowEnd) {
    throw new Error(
      'BellField update cannot be installed: this release is newer than the license update window. Renew update coverage to install this update.'
    );
  }
}

export function readBuildManifest(releaseRoot) {
  const manifestPath = join(releaseRoot, 'bellfield-build-manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`Build manifest is missing: ${manifestPath}`);
  }

  const parsed = readJson(manifestPath);
  if (!isRecord(parsed)) {
    throw new Error(`Build manifest is invalid: ${manifestPath}`);
  }

  const version = requiredString(parsed.version);
  const releaseDate = requiredString(parsed.releaseDate);
  const generatedAt = requiredString(parsed.generatedAt);
  const sourceCommit = parsed.sourceCommit === null ? null : requiredString(parsed.sourceCommit);

  if (
    parsed.schemaVersion !== 1 ||
    parsed.buildKind !== 'release' ||
    parsed.licenseRequired !== true ||
    !version ||
    !releaseDate ||
    !generatedAt ||
    !isValidIsoDate(releaseDate) ||
    !Number.isFinite(Date.parse(generatedAt)) ||
    sourceCommit === undefined
  ) {
    throw new Error(`Build manifest is invalid: ${manifestPath}`);
  }

  return {
    schemaVersion: 1,
    buildKind: 'release',
    licenseRequired: true,
    version,
    releaseDate,
    generatedAt,
    sourceCommit
  };
}

function collectReleaseFiles(releaseRoot) {
  const root = resolve(releaseRoot);
  const files = [];

  function walk(directory) {
    for (const entry of readdirSync(directory).sort((left, right) => left.localeCompare(right))) {
      const path = join(directory, entry);
      const stat = statSync(path);
      if (stat.isDirectory()) {
        walk(path);
        continue;
      }
      if (!stat.isFile()) {
        continue;
      }

      const relativePath = toArtifactPath(relative(root, path));
      if (relativePath === updateManifestFilename || relativePath === updateSignatureFilename) {
        continue;
      }

      files.push({
        path: relativePath,
        bytes: stat.size,
        sha256: hashFile(path)
      });
    }
  }

  walk(root);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function summarizePathDelta(expectedPaths, actualPaths) {
  const expected = new Set(expectedPaths);
  const actual = new Set(actualPaths);
  const missing = expectedPaths.filter((path) => !actual.has(path)).slice(0, 10);
  const extra = actualPaths.filter((path) => !expected.has(path)).slice(0, 10);
  const firstDifferentIndex = findFirstDifferentIndex(expectedPaths, actualPaths);

  return [
    `manifestFiles=${expectedPaths.length}`,
    `actualFiles=${actualPaths.length}`,
    `firstDifferentIndex=${firstDifferentIndex}`,
    `missing=${JSON.stringify(missing)}`,
    `extra=${JSON.stringify(extra)}`
  ].join(' ');
}

function findFirstDifferentIndex(expectedPaths, actualPaths) {
  const length = Math.max(expectedPaths.length, actualPaths.length);
  for (let index = 0; index < length; index += 1) {
    if (expectedPaths[index] !== actualPaths[index]) {
      return index;
    }
  }
  return -1;
}

function parseUpdateManifest(value, path) {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    value.artifactKind !== 'bellfield-server-release'
  ) {
    throw new Error(`Update artifact manifest is invalid: ${path}`);
  }
  if (!Number.isFinite(Date.parse(requiredString(value.signedAt) ?? ''))) {
    throw new Error(`Update artifact manifest is invalid: ${path}`);
  }
  if (!Array.isArray(value.files)) {
    throw new Error(`Update artifact manifest is invalid: ${path}`);
  }

  const build = parseBuildManifestObject(value.build, path);
  const files = value.files.map((file) => parseFileEntry(file, path));
  return {
    schemaVersion: 1,
    artifactKind: 'bellfield-server-release',
    signedAt: value.signedAt,
    build,
    files
  };
}

function parseBuildManifestObject(value, path) {
  if (!isRecord(value)) {
    throw new Error(`Update artifact build manifest is invalid: ${path}`);
  }

  const version = requiredString(value.version);
  const releaseDate = requiredString(value.releaseDate);
  const generatedAt = requiredString(value.generatedAt);
  const sourceCommit = value.sourceCommit === null ? null : requiredString(value.sourceCommit);

  if (
    value.schemaVersion !== 1 ||
    value.buildKind !== 'release' ||
    value.licenseRequired !== true ||
    !version ||
    !releaseDate ||
    !generatedAt ||
    !isValidIsoDate(releaseDate) ||
    !Number.isFinite(Date.parse(generatedAt)) ||
    sourceCommit === undefined
  ) {
    throw new Error(`Update artifact build manifest is invalid: ${path}`);
  }

  return {
    schemaVersion: 1,
    buildKind: 'release',
    licenseRequired: true,
    version,
    releaseDate,
    generatedAt,
    sourceCommit
  };
}

function parseFileEntry(value, path) {
  if (!isRecord(value)) {
    throw new Error(`Update artifact file entry is invalid: ${path}`);
  }

  const filePath = requiredString(value.path);
  const sha256 = requiredString(value.sha256);
  if (
    !filePath ||
    !sha256 ||
    !/^[a-f0-9]{64}$/.test(sha256) ||
    !Number.isSafeInteger(value.bytes) ||
    value.bytes < 0 ||
    filePath.includes('\\') ||
    filePath.includes('..')
  ) {
    throw new Error(`Update artifact file entry is invalid: ${path}`);
  }

  return {
    path: filePath,
    bytes: value.bytes,
    sha256
  };
}

function parseSignatureEnvelope(value, path) {
  if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.signature)) {
    throw new Error(`Update artifact signature is invalid: ${path}`);
  }
  if (
    value.signature.algorithm !== releaseArtifactSignatureAlgorithm ||
    value.signature.keyId !== releaseArtifactKeyId ||
    !requiredString(value.signature.value)
  ) {
    throw new Error(`Update artifact signature is invalid: ${path}`);
  }

  return {
    schemaVersion: 1,
    signature: {
      algorithm: releaseArtifactSignatureAlgorithm,
      keyId: releaseArtifactKeyId,
      value: value.signature.value
    }
  };
}

function hashFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function toArtifactPath(path) {
  return path.split(/[\\/]+/).join('/');
}

function canonicalizeJson(value) {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('Cannot canonicalize non-finite number.');
    }
    return JSON.stringify(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeJson(item)).join(',')}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalizeJson(value[key])}`)
      .join(',')}}`;
  }
  throw new Error('Unsupported value in canonical JSON.');
}

function requiredString(value) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim() !== value) {
    return undefined;
  }
  return value;
}

function assertIsoDate(value, name) {
  const checked = requiredString(value);
  if (!checked || !isValidIsoDate(checked)) {
    throw new Error(`${name} must be a YYYY-MM-DD date.`);
  }
  return checked;
}

function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
