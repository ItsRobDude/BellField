import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeSmokeEvidence } from './smoke-evidence.mjs';

// Validates that `pnpm build:release` produced a coherent, production-shaped
// release tree. This is the cheap automated stand-in for the manual gate-day
// "does the artifact assemble" check: it does NOT install or boot the release,
// only asserts the packaged manifest and static layout are intact so a broken
// build:release is caught in CI instead of on gate day.

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const releaseRoot = resolve(getArgValue('--release-root') ?? join(repoRoot, 'release'));

const evidence = {
  name: 'Release build smoke',
  startedAt: new Date().toISOString(),
  releaseRoot,
  checks: []
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

try {
  check('release root exists', existsSync(releaseRoot), { releaseRoot });

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

  // Signed update artifact (the updater verifies these at install time).
  check(
    'signed update manifest exists',
    existsSync(join(releaseRoot, 'bellfield-update-manifest.json'))
  );
  check(
    'update signature exists',
    existsSync(join(releaseRoot, 'bellfield-update-signature.json'))
  );

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
  check(
    'office-web standalone server exists',
    existsSync(join(releaseRoot, 'apps', 'office-web', 'apps', 'office-web', 'server.js'))
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

function check(name, passed, details = {}) {
  evidence.checks.push({ name, passed, details });
  if (!passed) {
    throw new Error(name);
  }
}
