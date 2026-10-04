import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { inlineCodeSpans, markdownLines } from './markdown.mjs';

// Current executable guidance only. Dated evidence is deliberately not a promise
// that an old command still exists. Other documents can opt in with the marker.
export const commandDocuments = new Set([
  'README.md',
  'AGENTS.md',
  'docs/README.md',
  'docs/repo-map.md',
  'docs/dev-setup.md',
  'docs/engineering-standards.md',
  'docs/validation-playbook.md',
  'docs/database-migrations.md',
  'docs/install-runbook.md',
  'docs/restore-runbook.md',
  'docs/release-operator-route.md',
  'docs/release-usb-preflight-checklist.md',
  'docs/release-usb-preflight-checkoff-template.md',
  'docs/gate-day-checklist.md',
  'docs/architecture-guardrails.md',
  'docs/maintainability-refactor-plan.md',
  'docs/field-mobile-smoke.md',
  'docs/agent-tooling.md'
]);
export const commandCheckMarker = '<!-- bellfield-docs:check-commands -->';

export function shouldCheckCommands(path, source) {
  return (
    source.includes(commandCheckMarker) ||
    commandDocuments.has(path) ||
    path.startsWith('docs/agent-workflows/')
  );
}

const builtins = new Set([
  'add',
  'approve-builds',
  'audit',
  'bin',
  'cache',
  'completion',
  'config',
  'create',
  'dedupe',
  'deploy',
  'dlx',
  'doctor',
  'env',
  'exec',
  'fetch',
  'find-dupes',
  'help',
  'ignored-builds',
  'import',
  'init',
  'install',
  'i',
  'licenses',
  'link',
  'list',
  'ls',
  'outdated',
  'pack',
  'patch',
  'patch-commit',
  'patch-remove',
  'prune',
  'publish',
  'rebuild',
  'remove',
  'rm',
  'root',
  'self-update',
  'server',
  'setup',
  'store',
  'unlink',
  'update',
  'up',
  'why'
]);
const booleanFlags = new Set([
  '--stream',
  '--parallel',
  '--aggregate-output',
  '--if-present',
  '--silent',
  '-s',
  '--no-bail',
  '--report-summary'
]);
const shellLanguages = new Set([
  '',
  'powershell',
  'ps1',
  'pwsh',
  'sh',
  'bash',
  'shell',
  'shell-session',
  'console',
  'text',
  'plaintext',
  'cmd',
  'bat'
]);

export function readWorkspaceScripts(root) {
  const packages = [];
  const add = (relativePath) => {
    const path = join(root, relativePath, 'package.json');
    if (!existsSync(path)) return;
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    packages.push({
      name: manifest.name ?? relativePath,
      path: relativePath,
      scripts: new Set(Object.keys(manifest.scripts ?? {}))
    });
  };
  add('.');
  // These are BellField's two declared pnpm-workspace.yaml package globs.
  for (const parent of ['apps', 'packages']) {
    if (!existsSync(join(root, parent))) continue;
    for (const entry of readdirSync(join(root, parent), { withFileTypes: true })) {
      if (entry.isDirectory()) add(`${parent}/${entry.name}`);
    }
  }
  return packages;
}

function tokenize(text) {
  return (text.match(/"[^"]*"|'[^']*'|[^\s]+/g) ?? []).map((token) =>
    token.replace(/^(["'])(.*)\1$/, '$2')
  );
}

function matchesFilter(name, filter) {
  const pattern = filter
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${pattern}$`).test(name);
}

export function checkPnpmCommands(source, packages) {
  const problems = [];
  const skipped = [];
  let checked = 0;
  for (const entry of markdownLines(source)) {
    const snippets = entry.code
      ? shellLanguages.has((entry.language ?? '').toLowerCase())
        ? [entry.text]
        : []
      : inlineCodeSpans(entry.text).map((span) => span.text);
    for (const snippet of snippets) {
      for (const match of snippet.matchAll(
        /(?:^|[\s;&|])(?:corepack\s+)?pnpm(?:\.cmd)?\s+([^\n;&|]+)/g
      )) {
        const tokens = tokenize(match[1]);
        let scopes = packages.filter((item) => item.path === '.');
        let filter = null;
        let recursive = false;
        let rootScope = false;
        let unsupported = null;
        let index = 0;
        for (; index < tokens.length && tokens[index].startsWith('-'); index++) {
          const token = tokens[index];
          if (token === '--filter' || token === '-F' || token === '--filter-prod') {
            filter = tokens[++index];
          } else if (token.startsWith('--filter='))
            filter = token.slice('--filter='.length).replace(/^(["'])(.*)\1$/, '$2');
          else if (token === '-r' || token === '--recursive') recursive = true;
          else if (token === '-w' || token === '--workspace-root') rootScope = true;
          else if (
            token === '--version' ||
            token === '-v' ||
            token === '--help' ||
            token === '-h'
          ) {
            index = tokens.length;
            break;
          } else if (!booleanFlags.has(token)) unsupported = `option ${token}`;
        }
        const explicitRun = tokens[index] === 'run';
        if (explicitRun) {
          index++;
          while (tokens[index]?.startsWith('-')) {
            if (!booleanFlags.has(tokens[index])) unsupported = `run option ${tokens[index]}`;
            index++;
          }
        }
        const command = tokens[index];
        if (!command || command === '#') continue;
        if (/[<>$]|\.\.\.|…/.test(command) || (filter && /[<>$]|\.\.\.|…/.test(filter)))
          unsupported = 'placeholder or advanced filter';
        if (unsupported) {
          skipped.push({
            line: entry.line,
            command: match[0].trim(),
            reason: `Command syntax outside the checker contract: ${unsupported}.`
          });
          continue;
        }
        if (!explicitRun && builtins.has(command)) continue;
        if (filter) scopes = packages.filter((item) => matchesFilter(item.name, filter));
        else if (recursive && !rootScope) scopes = packages.filter((item) => item.path !== '.');
        checked++;
        if (scopes.length === 0) {
          problems.push({
            line: entry.line,
            rule: 'unknown-workspace',
            message: `pnpm filter ${filter ?? '(recursive)'} matches no workspace package.`
          });
        } else if (!scopes.some((item) => item.scripts.has(command))) {
          problems.push({
            line: entry.line,
            rule: 'missing-script',
            message: `pnpm script "${command}" does not exist in ${filter ? `workspace ${filter}` : recursive ? 'the workspace packages' : 'the root package'}.`
          });
        }
      }
    }
  }
  return { checked, problems, skipped };
}
