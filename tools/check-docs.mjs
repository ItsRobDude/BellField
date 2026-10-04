import { existsSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { headingAnchors, markdownLinks } from './docs/markdown.mjs';
import { checkPnpmCommands, readWorkspaceScripts, shouldCheckCommands } from './docs/commands.mjs';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const generatedSegments = new Set([
  '.git',
  'node_modules',
  'artifacts',
  'release',
  'coverage',
  'dist',
  '.next',
  '.expo',
  '.turbo'
]);
const compare = (left, right) => (left < right ? -1 : left > right ? 1 : 0);

export function collectMarkdownFiles(root) {
  const result = spawnSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    {
      cwd: root,
      encoding: 'utf8',
      shell: false,
      windowsHide: true
    }
  );
  if (result.error || result.status !== 0)
    throw new Error(
      `Cannot list repository documents: ${result.error?.message ?? result.stderr.trim()}`
    );
  return [
    ...new Set(
      result.stdout
        .split('\0')
        .filter(
          (path) =>
            /\.(?:md|markdown)$/i.test(path) &&
            !path.split('/').some((segment) => generatedSegments.has(segment)) &&
            existsSync(resolve(root, path))
        )
    )
  ].sort(compare);
}

function decoded(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function checkDocuments({ root = defaultRoot, files = collectMarkdownFiles(root) } = {}) {
  root = resolve(root);
  const problems = [];
  const skippedCommands = [];
  const commandFiles = [];
  const packages = readWorkspaceScripts(root);
  const anchorCache = new Map();
  let linksChecked = 0;
  let commandsChecked = 0;
  for (const file of [...files].sort(compare)) {
    const sourcePath = resolve(root, file);
    const source = readFileSync(sourcePath, 'utf8');
    for (const link of markdownLinks(source)) {
      if (link.target === undefined) {
        problems.push({
          file,
          line: link.line,
          rule: 'missing-reference',
          message: `Markdown reference [${link.reference}] has no definition.`
        });
        continue;
      }
      if (!link.target || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(link.target)) continue;
      const hash = link.target.indexOf('#');
      const rawPath = (hash < 0 ? link.target : link.target.slice(0, hash)).split('?')[0];
      const targetPath = rawPath
        ? resolve(
            rawPath.startsWith('/') ? root : dirname(sourcePath),
            decoded(rawPath).replace(/^\//, '').replace(/\\/g, '/')
          )
        : sourcePath;
      const targetRelative = relative(root, targetPath);
      if (
        targetRelative === '..' ||
        targetRelative.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) ||
        isAbsolute(targetRelative)
      ) {
        problems.push({
          file,
          line: link.line,
          rule: 'outside-repository',
          message: `Local link leaves the repository: ${link.target}`
        });
        continue;
      }
      linksChecked++;
      if (!existsSync(targetPath)) {
        problems.push({
          file,
          line: link.line,
          rule: 'missing-target',
          message: `Local link target does not exist: ${link.target}`
        });
        continue;
      }
      const anchor = hash < 0 ? '' : decoded(link.target.slice(hash + 1));
      if (
        !anchor ||
        link.image ||
        !['.md', '.markdown'].includes(extname(targetPath).toLowerCase()) ||
        !statSync(targetPath).isFile()
      )
        continue;
      if (!anchorCache.has(targetPath))
        anchorCache.set(targetPath, headingAnchors(readFileSync(targetPath, 'utf8')));
      if (!anchorCache.get(targetPath).has(anchor))
        problems.push({
          file,
          line: link.line,
          rule: 'missing-anchor',
          message: `Markdown heading or explicit HTML anchor does not exist: ${link.target}`
        });
    }
    if (shouldCheckCommands(file, source)) {
      commandFiles.push(file);
      const result = checkPnpmCommands(source, packages);
      commandsChecked += result.checked;
      problems.push(...result.problems.map((problem) => ({ file, ...problem })));
      skippedCommands.push(...result.skipped.map((command) => ({ file, ...command })));
    }
  }
  problems.sort(
    (left, right) =>
      compare(left.file, right.file) ||
      left.line - right.line ||
      compare(left.rule, right.rule) ||
      compare(left.message, right.message)
  );
  return {
    schemaVersion: 1,
    status: problems.length ? 'failed' : 'passed',
    documentsChecked: files.length,
    linksChecked,
    commandsChecked,
    commandFiles,
    skippedCommands,
    problems
  };
}

export function runCli(
  args = process.argv.slice(2),
  { check = checkDocuments, log = console.log, errorLog = console.error } = {}
) {
  if (args[0] === '--') args = args.slice(1);
  const json = args.includes('--json');
  if (args.some((arg) => arg !== '--json')) {
    errorLog('Usage: node tools/check-docs.mjs [--json]');
    return 2;
  }
  try {
    const result = check();
    if (json) log(JSON.stringify(result, null, 2));
    else {
      log(
        `Docs check ${result.status}: ${result.documentsChecked} documents, ${result.linksChecked} local links, ${result.commandsChecked} script references in ${result.commandFiles.length} current command documents.`
      );
      for (const problem of result.problems)
        log(`- ${problem.file}:${problem.line} [${problem.rule}] ${problem.message}`);
      for (const command of result.skippedCommands)
        log(`- ${command.file}:${command.line} [command-not-checked] ${command.reason}`);
    }
    return result.problems.length ? 1 : 0;
  } catch (error) {
    if (json)
      log(JSON.stringify({ schemaVersion: 1, status: 'error', message: error.message }, null, 2));
    else errorLog(`Docs check could not complete: ${error.message}`);
    return 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exitCode = runCli();
