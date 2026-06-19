import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeSmokeEvidence } from './smoke-evidence.mjs';
import { verifyReleaseArtifact } from '../update/release-artifact.mjs';

// Validates that `pnpm build:release` produced a coherent, production-shaped
// release tree. This is the cheap automated stand-in for the manual gate-day
// "does the artifact assemble" check: it does NOT install or boot the release,
// only asserts the packaged manifest and static layout are intact so a broken
// build:release is caught in CI instead of on gate day.

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const releaseRoot = resolve(getArgValue('--release-root') ?? join(repoRoot, 'release'));
const releasePublicKeyPath =
  getArgValue('--release-public-key') ?? process.env.BELLFIELD_RELEASE_PUBLIC_KEY_PATH;
const requireGateDayDeps = getBooleanArg('--require-gate-day-deps', false);

const evidence = {
  name: 'Release build smoke',
  startedAt: new Date().toISOString(),
  releaseRoot,
  checks: []
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

try {
  check('release root exists', existsSync(releaseRoot), { releaseRoot });
  const expectedSourceCommit =
    getArgValue('--expected-source-commit') ?? runCapture('git', ['rev-parse', '--short', 'HEAD']);

  const manifestPath = join(releaseRoot, 'bellfield-build-manifest.json');
  check('build manifest exists', existsSync(manifestPath));
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  check('manifest marks a release build', manifest.buildKind === 'release', {
    buildKind: manifest.buildKind
  });
  check('manifest requires a license', manifest.licenseRequired === true);
  check(
    'manifest carries a version',
    typeof manifest.version === 'string' && manifest.version.length > 0,
    {
      version: manifest.version
    }
  );
  check('manifest release date is YYYY-MM-DD', DATE_PATTERN.test(String(manifest.releaseDate)), {
    releaseDate: manifest.releaseDate
  });
  check(
    'manifest stamps a source commit',
    typeof manifest.sourceCommit === 'string' && manifest.sourceCommit.length > 0,
    {
      sourceCommit: manifest.sourceCommit
    }
  );
  check(
    'manifest source commit matches current checkout',
    manifest.sourceCommit === expectedSourceCommit,
    {
      sourceCommit: manifest.sourceCommit,
      expectedSourceCommit
    }
  );

  // Signed update artifact (the updater verifies these at install time).
  check(
    'signed update manifest exists',
    existsSync(join(releaseRoot, 'bellfield-update-manifest.json'))
  );
  check(
    'update signature exists',
    existsSync(join(releaseRoot, 'bellfield-update-signature.json'))
  );
  const verifiedArtifact = verifyReleaseArtifact({
    releaseRoot,
    publicKeyPem: releasePublicKeyPath
      ? readFileSync(resolve(releasePublicKeyPath), 'utf8')
      : undefined
  });
  check('signed update artifact verifies release tree', true, {
    version: verifiedArtifact.build.version,
    releaseDate: verifiedArtifact.build.releaseDate,
    fileCount: verifiedArtifact.files.length,
    releasePublicKeyPath: releasePublicKeyPath ? resolve(releasePublicKeyPath) : 'embedded'
  });

  // Bundled Node runtime (node.exe on a Windows build, node on a POSIX build).
  const nodeDir = join(releaseRoot, 'runtime', 'node');
  check(
    'bundled node runtime exists',
    existsSync(join(nodeDir, 'node.exe')) || existsSync(join(nodeDir, 'node')),
    { nodeDir }
  );

  // Compiled apps.
  check(
    'api dist main exists',
    existsSync(join(releaseRoot, 'apps', 'api', 'dist', 'apps', 'api', 'src', 'main.js'))
  );
  check(
    'worker dist index exists',
    existsSync(join(releaseRoot, 'apps', 'worker', 'dist', 'index.js'))
  );
  const officeServer = firstExisting([
    join(releaseRoot, 'apps', 'office-web', 'server.js'),
    join(releaseRoot, 'apps', 'office-web', 'apps', 'office-web', 'server.js')
  ]);
  check('office-web standalone server exists', Boolean(officeServer), {
    officeServer: officeServer ? relative(repoRoot, officeServer) : null
  });
  const officeServerRoot = dirname(officeServer);
  const officeStaticRoot = join(officeServerRoot, '.next', 'static');
  check('office-web static assets are beside the standalone server', existsSync(officeStaticRoot), {
    officeServerRoot: relative(repoRoot, officeServerRoot),
    officeStaticRoot: relative(repoRoot, officeStaticRoot)
  });
  check(
    'office-web static JavaScript assets are packaged',
    hasFileMatching(officeStaticRoot, /\.js$/),
    {
      officeStaticRoot: relative(repoRoot, officeStaticRoot)
    }
  );
  const officeSourcePublicRoot = join(repoRoot, 'apps', 'office-web', 'public');
  const officeReleasePublicRoot = join(officeServerRoot, 'public');
  check(
    'office-web public assets are packaged when present',
    !existsSync(officeSourcePublicRoot) || existsSync(officeReleasePublicRoot),
    {
      officeSourcePublicRoot: relative(repoRoot, officeSourcePublicRoot),
      officeReleasePublicRoot: relative(repoRoot, officeReleasePublicRoot),
      sourcePublicExists: existsSync(officeSourcePublicRoot)
    }
  );
  check(
    'api migrations are packaged',
    existsSync(join(releaseRoot, 'apps', 'api', 'src', 'database', 'migrations'))
  );

  // Install + update tooling the runbook depends on.
  check(
    'install tooling is packaged',
    existsSync(join(releaseRoot, 'tools', 'install', 'render-windows-services.mjs'))
  );
  check(
    'updater entrypoint is packaged',
    existsSync(join(releaseRoot, 'tools', 'install', 'update-bellfield.mjs'))
  );
  check(
    'release signing lib is packaged',
    existsSync(join(releaseRoot, 'tools', 'update', 'release-artifact.mjs'))
  );
  check(
    'server env example is packaged',
    existsSync(join(releaseRoot, 'bellfield-server.env.example'))
  );

  // The env example must seed a production-shaped config (matches the
  // release runtime-mode guard: no dev mode, no bootstrap seeding).
  const envExample = readFileSync(join(releaseRoot, 'bellfield-server.env.example'), 'utf8');
  check('env example forces production mode', /^NODE_ENV=production$/m.test(envExample));
  check('env example disables bootstrap seeding', /^BOOTSTRAP_SEED_DATA=false$/m.test(envExample));

  if (requireGateDayDeps) {
    for (const tool of [
      'postgres.exe',
      'pg_ctl.exe',
      'initdb.exe',
      'psql.exe',
      'pg_dump.exe',
      'pg_restore.exe',
      'createdb.exe',
      'dropdb.exe'
    ]) {
      check(
        `gate-day PostgreSQL tool is packaged: ${tool}`,
        existsSync(join(releaseRoot, 'postgres', 'bin', tool))
      );
    }
    check(
      'gate-day WinSW executable is packaged',
      existsSync(join(releaseRoot, 'tools', 'winsw', 'WinSW-x64.exe'))
    );
  }

  evidence.completedAt = new Date().toISOString();
  evidence.result = 'passed';
  console.log(JSON.stringify(evidence, null, 2));
  console.log(`Evidence: ${writeSmokeEvidence(evidence, 'release-build-smoke.json')}`);
} catch (error) {
  evidence.completedAt = new Date().toISOString();
  evidence.result = 'failed';
  evidence.error = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify(evidence, null, 2));
  console.error(`Evidence: ${writeSmokeEvidence(evidence, 'release-build-smoke.json')}`);
  process.exitCode = 1;
}

function getArgValue(name) {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

function getBooleanArg(name, defaultValue) {
  const value = getArgValue(name);
  if (value === undefined) {
    return process.argv.includes(name) ? true : defaultValue;
  }
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function check(name, passed, details = {}) {
  evidence.checks.push({ name, passed, details });
  if (!passed) {
    throw new Error(name);
  }
}

function firstExisting(paths) {
  return paths.find((candidate) => existsSync(candidate));
}

function hasFileMatching(root, pattern) {
  if (!existsSync(root)) {
    return false;
  }

  for (const entry of readdirSync(root)) {
    const entryPath = join(root, entry);
    const stats = statSync(entryPath);
    if (stats.isDirectory() && hasFileMatching(entryPath, pattern)) {
      return true;
    }
    if (stats.isFile() && pattern.test(entry)) {
      return true;
    }
  }

  return false;
}

function runCapture(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  if (result.status !== 0 || result.error) {
    throw new Error(`Failed to run ${command} ${args.join(' ')}`);
  }

  return result.stdout.trim();
}
