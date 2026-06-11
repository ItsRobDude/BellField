import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Persist smoke evidence the way the office-web asset smoke does: one
 * timestamped directory per run under artifacts/validation (gitignored), so
 * gate evidence accumulates in one place regardless of which smoke produced
 * it.
 */
export function writeSmokeEvidence(evidence, filename) {
  const runId = (evidence.startedAt ?? new Date().toISOString()).replace(/[:.]/g, '-');
  const evidenceDir = join(repoRoot, 'artifacts', 'validation', runId);
  mkdirSync(evidenceDir, { recursive: true });
  const evidencePath = join(evidenceDir, filename);
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  return evidencePath;
}
