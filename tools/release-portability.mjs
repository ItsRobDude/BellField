import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

export function readJsonFile(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function packageDependencyNames(packageJsonPath) {
  const parsed = readJsonFile(packageJsonPath);
  return Object.keys(parsed.dependencies ?? {}).sort((left, right) => left.localeCompare(right));
}

export function packagePathForDependency(nodeModulesRoot, dependency) {
  return join(nodeModulesRoot, ...dependency.split('/'));
}

export function assertDependencyPackageJsons(packageRoot, dependencies, label) {
  const missing = [];
  for (const dependency of dependencies) {
    const packageJson = join(
      packagePathForDependency(join(packageRoot, 'node_modules'), dependency),
      'package.json'
    );
    if (!existsSync(packageJson) || !statSync(packageJson).isFile()) {
      missing.push(dependency);
    }
  }

  if (missing.length > 0) {
    throw new Error(`${label} is missing production dependencies: ${missing.join(', ')}`);
  }
}

export function assertNodeResolves(input) {
  const dependencies = [...input.dependencies].sort((left, right) => left.localeCompare(right));
  if (dependencies.length === 0) {
    return [];
  }

  const script = [
    "const { createRequire } = require('node:module');",
    'const req = createRequire(process.argv[1]);',
    'for (const dep of process.argv.slice(2)) {',
    '  console.log(`${dep}\\t${req.resolve(dep)}`);',
    '}'
  ].join(' ');
  const result = spawnSync(input.nodeExe, ['-e', script, input.fromFile, ...dependencies], {
    cwd: input.cwd ?? process.cwd(),
    encoding: 'utf8',
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: input.timeoutMs ?? 60_000
  });

  if (result.error) {
    throw new Error(`${input.label} dependency resolution failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      [
        `${input.label} dependency resolution exited with ${result.status}.`,
        result.stdout?.trim() ? `stdout:\n${result.stdout.trim()}` : '',
        result.stderr?.trim() ? `stderr:\n${result.stderr.trim()}` : ''
      ]
        .filter(Boolean)
        .join('\n')
    );
  }

  return result.stdout
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [dependency, resolvedPath] = line.split('\t');
      return { dependency, resolvedPath };
    });
}

export function firstExisting(paths) {
  return paths.find((candidate) => candidate && existsSync(candidate)) ?? null;
}

export function packagedNodeExecutable(releaseRoot) {
  return firstExisting([
    join(releaseRoot, 'runtime', 'node', process.platform === 'win32' ? 'node.exe' : 'node'),
    join(releaseRoot, 'runtime', 'node', 'node.exe'),
    join(releaseRoot, 'runtime', 'node', 'node')
  ]);
}

export function officeServerPath(releaseRoot) {
  return firstExisting([
    join(releaseRoot, 'apps', 'office-web', 'server.js'),
    join(releaseRoot, 'apps', 'office-web', 'apps', 'office-web', 'server.js')
  ]);
}

export function collectReparsePoints(root) {
  const resolvedRoot = resolve(root);
  if (!existsSync(resolvedRoot)) {
    throw new Error(`Cannot scan missing path for reparse points: ${resolvedRoot}`);
  }

  if (process.platform === 'win32') {
    return collectWindowsReparsePoints(resolvedRoot);
  }

  const results = [];
  function walk(directory) {
    const stat = lstatSync(directory);
    if (stat.isSymbolicLink()) {
      results.push(directory);
      return;
    }
    if (!stat.isDirectory()) {
      return;
    }
    for (const entry of readdirSync(directory)) {
      walk(join(directory, entry));
    }
  }
  walk(resolvedRoot);
  return results;
}

export function assertNoReparsePoints(root, label = 'release tree') {
  const matches = collectReparsePoints(root);
  if (matches.length === 0) {
    return;
  }

  const resolvedRoot = resolve(root);
  const sample = matches
    .slice(0, 20)
    .map((path) => relative(resolvedRoot, path) || '.')
    .join(', ');
  throw new Error(
    `${label} contains ${matches.length} reparse point(s) or symlink(s); first matches: ${sample}`
  );
}

function collectWindowsReparsePoints(root) {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    '$root = Get-Item -LiteralPath $env:BELLFIELD_REPARSE_SCAN_ROOT -Force',
    '$reparse = [IO.FileAttributes]::ReparsePoint',
    '$directory = [IO.FileAttributes]::Directory',
    '$stack = New-Object System.Collections.Generic.List[string]',
    'if (($root.Attributes -band $reparse) -ne 0) { $root.FullName; exit 0 }',
    '$stack.Add($root.FullName)',
    'while ($stack.Count -gt 0) {',
    '  $index = $stack.Count - 1',
    '  $current = $stack[$index]',
    '  $stack.RemoveAt($index)',
    '  foreach ($child in Get-ChildItem -LiteralPath $current -Force) {',
    '    if (($child.Attributes -band $reparse) -ne 0) { $child.FullName; continue }',
    '    if (($child.Attributes -band $directory) -ne 0) { $stack.Add($child.FullName) }',
    '  }',
    '}'
  ].join('; ');
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
    {
      encoding: 'utf8',
      env: { ...process.env, BELLFIELD_REPARSE_SCAN_ROOT: root },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120_000
    }
  );

  if (result.error) {
    throw new Error(`Failed to scan reparse points: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`Failed to scan reparse points:\n${result.stderr.trim()}`);
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}
