import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, test } from 'node:test';
import { checkDocuments, collectMarkdownFiles, runCli } from './check-docs.mjs';
import { checkPnpmCommands, shouldCheckCommands } from './docs/commands.mjs';
import { headingAnchors, markdownLinks } from './docs/markdown.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'bellfield docs test '));
  roots.push(root);
  const write = (file, source) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), source, 'utf8');
  };
  write(
    'package.json',
    JSON.stringify({
      name: 'bellfield',
      scripts: { 'check:docs': 'node tools/check-docs.mjs', test: 'node --test' }
    })
  );
  write(
    'apps/api/package.json',
    JSON.stringify({ name: '@bellfield/api', scripts: { 'migration:up': 'node up.mjs' } })
  );
  return { root, write };
}

test('local inline and reference links resolve encoded paths, anchors and image paths', () => {
  const { root, write } = fixture();
  write('docs/My Guide.md', '# Run `pnpm test`\n\n## Repeat\n\n## Repeat\n\n<a id="manual"></a>\n');
  write('docs/photo.png', 'fixture');
  write(
    'README.md',
    [
      '[inline](docs/My%20Guide.md#run-pnpm-test)',
      '[spaced](<docs/My Guide.md#repeat-1> "title")',
      '[full reference][guide]',
      '[guide][]',
      '[guide]',
      '[guide]: <docs/My Guide.md#manual>',
      '![image](docs/photo.png#not-a-heading)'
    ].join('\n')
  );
  const result = checkDocuments({ root, files: ['README.md', 'docs/My Guide.md'] });
  assert.deepEqual(result.problems, []);
  assert.equal(result.linksChecked, 6);
});

test('reports exact source locations for missing files, anchors and reference definitions', () => {
  const { root, write } = fixture();
  write('docs/guide.md', '# Present\n');
  write(
    'README.md',
    '[missing](docs/absent.md)\n[anchor](docs/guide.md#absent)\n[reference][absent]\n'
  );
  const result = checkDocuments({ root, files: ['README.md'] });
  assert.equal(result.status, 'failed');
  assert.deepEqual(
    result.problems.map(({ line, rule }) => ({ line, rule })),
    [
      { line: 1, rule: 'missing-target' },
      { line: 2, rule: 'missing-anchor' },
      { line: 3, rule: 'missing-reference' }
    ]
  );
});

test('code fences, inline code, escaped brackets, comments and protocol links are not local links', () => {
  const { root, write } = fixture();
  write(
    'README.md',
    [
      '```markdown',
      '[fenced](missing.md)',
      '```',
      '~~~markdown',
      '[also fenced](missing.md)',
      '~~~~',
      '`[inline](missing.md)` and ``[another](missing.md)``',
      '\\[escaped](missing.md)',
      '<!-- [comment](missing.md) -->',
      '[web](https://example.test/a#anything) [mail](mailto:a@example.test)',
      '[protocol](custom:page) [cdn](//example.test/a)'
    ].join('\n')
  );
  const result = checkDocuments({ root, files: ['README.md'] });
  assert.equal(result.linksChecked, 0);
  assert.deepEqual(result.problems, []);
});

test('heading anchors retain inline-code text, Unicode and collision-safe duplicate suffixes', () => {
  const anchors = headingAnchors(
    '# `pnpm test` & Café!\n## Same\n## Same-1\n## Same\nSetext title\n===\n```md\n# Hidden\n```'
  );
  assert.deepEqual([...anchors], ['pnpm-test--café', 'same', 'same-1', 'same-2', 'setext-title']);
});

test('nested labels, balanced destination parentheses and case-insensitive reference labels work', () => {
  const links = markdownLinks(
    '[outer [inner]](guide(one).md#part)\n[Label][ GUIDE ]\n[guide]: guide.md "title"'
  );
  assert.deepEqual(
    links.map((link) => link.target),
    ['guide(one).md#part', 'guide.md']
  );
});

test('normal prose line wrapping preserves multiline link labels and their original source line', () => {
  const links = markdownLinks(
    'Intro\n[USB preflight\nchecklist](./checklist.md#ready)\n[wrapped\nreference][guide]\n[guide]: ./guide.md'
  );
  assert.deepEqual(
    links.map(({ target, line }) => ({ target, line })),
    [
      { target: './checklist.md#ready', line: 2 },
      { target: './guide.md', line: 4 }
    ]
  );
});

test('multiline reference definitions are checked and duplicate definitions keep the first target', () => {
  const { root, write } = fixture();
  write(
    'README.md',
    [
      '[wrapped][guide]',
      '[guide]:',
      '  docs/missing.md',
      '[guide]: docs/present.md',
      '[other][second]',
      '[second]:',
      '  <docs/present.md#absent>'
    ].join('\n')
  );
  write('docs/present.md', '# Present');
  const result = checkDocuments({ root, files: ['README.md'] });
  assert.deepEqual(
    result.problems.map(({ line, rule }) => ({ line, rule })),
    [
      { line: 1, rule: 'missing-target' },
      { line: 5, rule: 'missing-anchor' }
    ]
  );
});

test('same-page anchors and root-relative paths work and outside-repository links fail', () => {
  const { root, write } = fixture();
  write(
    'docs/guide.md',
    '# Guide\n[self](#guide)\n[root](/README.md#root)\n[outside](../../escape.md)\n'
  );
  write('README.md', '# Root\n');
  const result = checkDocuments({ root, files: ['docs/guide.md'] });
  assert.deepEqual(
    result.problems.map((item) => item.rule),
    ['outside-repository']
  );
});

test('script commands check root and filtered workspace scopes without mistaking built-ins', () => {
  const { root, write } = fixture();
  write(
    'README.md',
    [
      '```powershell',
      'pnpm install --frozen-lockfile',
      'pnpm exec prettier --check .',
      'pnpm --version',
      'corepack pnpm check:docs',
      'pnpm run test',
      'pnpm --filter @bellfield/api migration:up',
      'pnpm --filter="@bellfield/api" migration:up',
      'pnpm --filter @bellfield/missing migration:up',
      'pnpm migration:up',
      'pnpm --filter @bellfield/api check:docs',
      'pnpm run install',
      '```'
    ].join('\n')
  );
  const result = checkDocuments({ root, files: ['README.md'] });
  assert.deepEqual(
    result.problems.map((item) => item.rule),
    ['unknown-workspace', 'missing-script', 'missing-script', 'missing-script']
  );
  assert.equal(result.commandsChecked, 8);
});

test('command checks are bounded to current guidance or explicit opt-in, with history still link-checked', () => {
  const { root, write } = fixture();
  write('docs/smoke-2026-01-01.md', '`pnpm retired:script`\n[missing](absent.md)');
  write('docs/new-tool.md', '<!-- bellfield-docs:check-commands -->\n`pnpm missing:script`');
  const result = checkDocuments({ root, files: ['docs/smoke-2026-01-01.md', 'docs/new-tool.md'] });
  assert.deepEqual(result.commandFiles, ['docs/new-tool.md']);
  assert.deepEqual(
    result.problems.map((item) => item.rule),
    ['missing-script', 'missing-target']
  );
  assert.equal(shouldCheckCommands('docs/agent-tooling.md', ''), true);
});

test('placeholder commands and unsupported selectors are reported as skipped, while placeholder arguments still check the script', () => {
  const packages = [{ name: 'bellfield', path: '.', scripts: new Set(['test']) }];
  const source = [
    '```sh',
    'pnpm <script>',
    'pnpm ...',
    'pnpm --filter <package> test',
    'pnpm --filter ...api test',
    'pnpm absent --output=<file>',
    'pnpm test -- <file>',
    '```'
  ].join('\n');
  const result = checkPnpmCommands(source, packages);
  assert.equal(result.skipped.length, 4);
  assert.equal(result.checked, 2);
  assert.deepEqual(
    result.problems.map((item) => item.rule),
    ['missing-script']
  );
});

test('recursive scripts and simple wildcard filters search workspace packages', () => {
  const packages = [
    { name: 'bellfield', path: '.', scripts: new Set() },
    { name: '@bellfield/api', path: 'apps/api', scripts: new Set(['build']) }
  ];
  const result = checkPnpmCommands(
    '`pnpm -r build` and `pnpm --filter @bellfield/* run build`',
    packages
  );
  assert.equal(result.checked, 2);
  assert.deepEqual(result.problems, []);
});

test('pnpm run options before the script do not become script names', () => {
  const packages = [{ name: 'bellfield', path: '.', scripts: new Set(['test']) }];
  const result = checkPnpmCommands(
    '`pnpm run --silent test` and `pnpm run --if-present test` and `pnpm run --silent missing`',
    packages
  );
  assert.equal(result.checked, 3);
  assert.equal(result.skipped.length, 0);
  assert.deepEqual(
    result.problems.map((item) => item.rule),
    ['missing-script']
  );
  assert.match(result.problems[0].message, /"missing"/);
});

test('Git discovery includes tracked and new source Markdown but excludes ignored and generated files', () => {
  const { root, write } = fixture();
  write('.gitignore', 'ignored/\n');
  write('README.md', '# Root');
  write('docs/new.md', '# New');
  write('ignored/local.md', '# Ignored');
  write('node_modules/package/README.md', '# Generated');
  write('artifacts/result.md', '# Evidence');
  const init = spawnSync('git', ['init', '--quiet'], { cwd: root, encoding: 'utf8', shell: false });
  assert.equal(init.status, 0, init.stderr);
  const add = spawnSync('git', ['add', 'README.md'], { cwd: root, encoding: 'utf8', shell: false });
  assert.equal(add.status, 0, add.stderr);
  assert.deepEqual(collectMarkdownFiles(root), ['README.md', 'docs/new.md']);
});

test('CLI accepts pnpm argument forwarding, emits parseable JSON and fails on actionable findings', () => {
  const output = [];
  const result = {
    schemaVersion: 1,
    status: 'failed',
    documentsChecked: 1,
    linksChecked: 1,
    commandsChecked: 0,
    commandFiles: [],
    skippedCommands: [],
    problems: [{ file: 'README.md', line: 1, rule: 'missing-target', message: 'Missing guide.md' }]
  };
  const code = runCli(['--', '--json'], { check: () => result, log: (text) => output.push(text) });
  assert.equal(code, 1);
  assert.deepEqual(JSON.parse(output[0]), result);
  assert.equal(runCli(['--unknown'], { errorLog: () => {} }), 2);
});
