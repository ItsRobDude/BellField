import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readArgs } from './install-utils.mjs';

// Rerun-28 was lost to a USB whose START-HERE.txt documented a Gate 1 command
// that skipped gate1-prepare-release, bolted -ArtifactZip onto
// gate1-admin-install, used a relative artifact path, and omitted the
// mandatory roots - so the runner idled at an invisible parameter prompt and
// the product was never exercised. This validator makes the USB build fail
// when START-HERE's runner commands do not match the documented Gate Day
// command contract (docs/gate-day-checklist.md).

const PREPARE_MODES = new Set(['gate1-prepare-release', 'gate3-prepare-update-artifact']);
const REQUIRED_ARGUMENTS = ['-InstallRoot', '-ReleaseRoot', '-EvidenceRoot', '-RunId'];

export function validateStartHereText(text) {
  const problems = [];
  const commands = extractRunnerCommands(text);

  if (commands.length === 0) {
    problems.push('START-HERE contains no run-gate-day-admin.ps1 commands.');
    return { status: 'failed', commands, problems };
  }

  const prepareIndex = commands.findIndex((command) => command.mode === 'gate1-prepare-release');
  const adminInstallIndex = commands.findIndex((command) => command.mode === 'gate1-admin-install');

  if (prepareIndex === -1) {
    problems.push('Missing a -Mode gate1-prepare-release command.');
  }
  if (adminInstallIndex === -1) {
    problems.push('Missing a -Mode gate1-admin-install command.');
  }
  if (prepareIndex !== -1 && adminInstallIndex !== -1 && adminInstallIndex < prepareIndex) {
    problems.push('gate1-admin-install appears before gate1-prepare-release.');
  }

  for (const command of commands) {
    const label = command.mode ? `-Mode ${command.mode}` : 'runner command';

    if (!command.mode) {
      problems.push(`A run-gate-day-admin.ps1 command has no -Mode argument: ${command.line}`);
      continue;
    }

    for (const required of REQUIRED_ARGUMENTS) {
      if (!command.arguments.has(required.toLowerCase())) {
        problems.push(`${label} is missing ${required}.`);
      }
    }

    const artifactZip = command.arguments.get('-artifactzip');
    if (PREPARE_MODES.has(command.mode)) {
      if (artifactZip === undefined) {
        problems.push(`${label} is missing -ArtifactZip.`);
      } else if (isDotRelativePath(artifactZip)) {
        problems.push(
          `${label} uses a relative -ArtifactZip (${artifactZip}); UAC elevation can change the child working directory. Use an absolute path or a $usb-anchored variable.`
        );
      }
    } else if (artifactZip !== undefined) {
      problems.push(
        `${label} must not take -ArtifactZip; only prepare modes accept it. Non-prepare modes install from -ReleaseRoot.`
      );
    }

    const evidenceRoot = command.arguments.get('-evidenceroot');
    if (evidenceRoot !== undefined && isDotRelativePath(evidenceRoot)) {
      problems.push(
        `${label} uses a relative -EvidenceRoot (${evidenceRoot}); use an absolute path or a $usb-anchored variable.`
      );
    }

    if (command.mode === 'gate1-admin-install' && /^\.[\\/]/.test(command.scriptPath ?? '')) {
      problems.push(
        'gate1-admin-install must run the prepared release copy of run-gate-day-admin.ps1 (under the release root), not the USB tools copy.'
      );
    }
  }

  return {
    status: problems.length === 0 ? 'ok' : 'failed',
    commands: commands.map((command) => ({ mode: command.mode, line: command.line })),
    problems
  };
}

function extractRunnerCommands(text) {
  // Join PowerShell backtick line continuations, then keep lines invoking the
  // runner script.
  const joined = text.replace(/`\r?\n\s*/g, ' ');
  const commands = [];
  for (const rawLine of joined.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!/run-gate-day-admin\.ps1/i.test(line)) {
      continue;
    }

    const tokens = tokenize(line);
    const scriptIndex = tokens.findIndex((token) => /run-gate-day-admin\.ps1$/i.test(token));
    const argumentsMap = new Map();
    for (let index = scriptIndex + 1; index < tokens.length; index += 1) {
      const token = tokens[index];
      if (!token.startsWith('-')) {
        continue;
      }
      const next = tokens[index + 1];
      if (next === undefined || next.startsWith('-')) {
        argumentsMap.set(token.toLowerCase(), '');
      } else {
        argumentsMap.set(token.toLowerCase(), next);
        index += 1;
      }
    }

    commands.push({
      line,
      scriptPath: scriptIndex >= 0 ? tokens[scriptIndex] : null,
      mode: argumentsMap.get('-mode') ?? null,
      arguments: argumentsMap
    });
  }
  return commands;
}

function tokenize(line) {
  const tokens = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match;
  while ((match = pattern.exec(line)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3]);
  }
  return tokens;
}

function isDotRelativePath(value) {
  return /^\.{1,2}[\\/]/.test(value);
}

const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === (process.argv[1] ?? '');

if (invokedDirectly) {
  const args = readArgs();
  const filePath = String(args.path ?? '');
  if (!filePath) {
    console.error('Usage: node tools/install/validate-start-here.mjs --path=<START-HERE.txt>');
    process.exit(2);
  }
  const result = validateStartHereText(readFileSync(filePath, 'utf8'));
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'ok') {
    process.exitCode = 1;
  }
}
