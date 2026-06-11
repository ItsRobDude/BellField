import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type RuntimeBuildManifest = {
  schemaVersion: 1;
  buildKind: 'source' | 'release';
  licenseRequired: boolean;
  version: string;
  releaseDate: string;
  generatedAt: string;
  sourceCommit: string | null;
};

export type AppBuildInfo = {
  version: string;
  releaseDate: string | null;
  buildKind: 'source' | 'release' | 'development';
  generatedAt: string | null;
  sourceCommit: string | null;
};

export function readRuntimeBuildManifest(): RuntimeBuildManifest | null {
  const explicitPath = process.env.BELLFIELD_BUILD_MANIFEST_PATH?.trim();
  const candidates = [
    explicitPath,
    join(process.cwd(), 'bellfield-build-manifest.json'),
    join(process.cwd(), '..', '..', 'bellfield-build-manifest.json')
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    if (!existsSync(candidate)) {
      if (candidate === explicitPath) {
        throw new Error(`BellField build manifest was not found at ${candidate}.`);
      }
      continue;
    }

    const parsed = JSON.parse(readFileSync(candidate, 'utf8')) as unknown;
    return parseRuntimeBuildManifest(parsed, candidate);
  }

  return null;
}

export function readAppBuildInfo(): AppBuildInfo {
  const manifest = readRuntimeBuildManifest();
  if (manifest) {
    return {
      version: manifest.version,
      releaseDate: manifest.releaseDate,
      buildKind: manifest.buildKind,
      generatedAt: manifest.generatedAt,
      sourceCommit: manifest.sourceCommit
    };
  }

  return {
    version: readPackageVersion(),
    releaseDate: null,
    buildKind: 'development',
    generatedAt: null,
    sourceCommit: null
  };
}

function parseRuntimeBuildManifest(value: unknown, path: string): RuntimeBuildManifest {
  if (!isRecord(value)) {
    throw new Error(`BellField build manifest is invalid: ${path}`);
  }

  if (
    value.schemaVersion !== 1 ||
    (value.buildKind !== 'source' && value.buildKind !== 'release') ||
    typeof value.licenseRequired !== 'boolean'
  ) {
    throw new Error(`BellField build manifest is invalid: ${path}`);
  }

  const version = requiredString(value.version);
  const releaseDate = requiredString(value.releaseDate);
  const generatedAt = requiredString(value.generatedAt);
  const sourceCommit = value.sourceCommit === null ? null : requiredString(value.sourceCommit);

  if (
    !version ||
    !releaseDate ||
    !generatedAt ||
    !isValidIsoDate(releaseDate) ||
    !Number.isFinite(Date.parse(generatedAt))
  ) {
    throw new Error(`BellField build manifest is invalid: ${path}`);
  }

  if (sourceCommit === undefined) {
    throw new Error(`BellField build manifest is invalid: ${path}`);
  }

  return {
    schemaVersion: 1,
    buildKind: value.buildKind,
    licenseRequired: value.licenseRequired,
    version,
    releaseDate,
    generatedAt,
    sourceCommit
  };
}

function readPackageVersion(): string {
  try {
    const raw = readFileSync(join(process.cwd(), 'package.json'), 'utf8');
    const parsed = JSON.parse(raw) as { version?: string };
    return parsed.version ?? 'unknown';
  } catch {
    return process.env.npm_package_version ?? 'unknown';
  }
}

function requiredString(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim() !== value) {
    return undefined;
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidIsoDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}
