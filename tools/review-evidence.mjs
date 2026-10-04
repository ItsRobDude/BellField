import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPacket } from './evidence/packet-reader.mjs';
import { summarizePacket } from './evidence/summarize.mjs';

export function reviewEvidence(root, limits) {
  return summarizePacket(openPacket(root, limits));
}

export function formatEvidenceReview(report) {
  const lines = [`Evidence review: ${report.reviewStatus}`, report.scope];
  for (const run of report.runs) {
    lines.push(
      `\n${run.kind}: ${run.name ?? run.mode ?? '(unnamed)'} — ${run.status} [${run.source.file}]`
    );
    if (run.runId) lines.push(`  Run: ${run.runId}`);
    if (run.dryRun) lines.push('  Dry run: reported; skipped work is not execution proof.');
    for (const launch of run.launchEvents ?? []) lines.push(`  Launch: ${launch.status}`);
    for (const item of [...(run.steps ?? []), ...(run.checks ?? [])]) {
      lines.push(
        `  ${item.status}: ${item.name ?? '(unnamed)'}${item.durationSeconds === null || item.durationSeconds === undefined ? '' : ` (${item.durationSeconds}s)`}`
      );
    }
    for (const item of run.reportedScopes ?? []) lines.push(`  ${item.status}: ${item.name}`);
    for (const item of run.timing ?? []) lines.push(`  Timing clue: ${item.clue}`);
  }
  lines.push('\nReported provenance (not verified or inferred):');
  if (!report.metadata.length)
    lines.push('  Unknown: no supported identity metadata in this packet.');
  for (const item of report.metadata) {
    const fields = ['sourceCommit', 'version', 'buildKind', 'releaseDate', 'sha256', 'artifactKind']
      .filter((field) => item[field] !== undefined)
      .map((field) => `${field}=${item[field]}`);
    lines.push(
      `  ${fields.join(', ')} [${item.source.file}${item.source.field ? `:${item.source.field}` : ''}]`
    );
  }
  lines.push('\nRunner mode coverage (supplied packet only):');
  for (const gate of report.gateCoverage) {
    lines.push(
      `  Gate ${gate.gate}: ${gate.assessment ?? `observed: ${gate.observedModes.join(', ') || 'none'}; not observed: ${gate.notObservedInPacket.join(', ') || 'none'}`}`
    );
  }
  lines.push(report.coverageCaution);
  if (report.earliestKnownFailure) {
    const failure = report.earliestKnownFailure;
    lines.push(
      `\nEarliest timestamped failure: ${failure.timestamp} — ${failure.step ?? '(unnamed)'} [${failure.source.file}:${failure.source.line ?? '?'}]`
    );
  }
  if (report.undatedFailureCount)
    lines.push(
      `Undated failures: ${report.undatedFailureCount}; chronological order cannot be established.`
    );
  for (const issue of report.issues)
    lines.push(
      `Issue: ${issue.code} [${issue.source.file}${issue.source.line ? `:${issue.source.line}` : ''}]`
    );
  lines.push(
    `\n${report.timingCaution}`,
    `Exit ${report.exitCode}: 0 reviewed; 1 evidence needs attention; 2 usage/read error.`
  );
  return lines.join('\n');
}

export function runEvidenceCli(argv) {
  const json = argv.includes('--json');
  try {
    let root;
    const args = argv[0] === '--' ? argv.slice(1) : argv;
    for (let index = 0; index < args.length; index++) {
      const arg = args[index];
      if (arg === '--json') continue;
      if (
        arg === '--root' &&
        args[index + 1] &&
        !args[index + 1].startsWith('--') &&
        root === undefined
      )
        root = args[++index];
      else if (arg.startsWith('--root=') && root === undefined) root = arg.slice(7);
      else
        throw new Error('Usage: node tools/review-evidence.mjs --root <packet-directory> [--json]');
    }
    if (!root)
      throw new Error('Usage: node tools/review-evidence.mjs --root <packet-directory> [--json]');
    const report = reviewEvidence(root);
    return {
      exitCode: report.exitCode,
      output: json ? JSON.stringify(report, null, 2) : formatEvidenceReview(report)
    };
  } catch {
    // Do not print native filesystem exceptions: they may contain private paths.
    const failure = {
      schemaVersion: 1,
      reviewStatus: 'error',
      exitCode: 2,
      error:
        'Cannot review packet. Supply --root <readable-directory> [--json]; links/junctions are not accepted.'
    };
    return { exitCode: 2, output: json ? JSON.stringify(failure, null, 2) : failure.error };
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = runEvidenceCli(process.argv.slice(2));
  console.log(result.output);
  process.exitCode = result.exitCode;
}
