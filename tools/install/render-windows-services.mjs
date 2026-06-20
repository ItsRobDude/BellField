import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeXml, parseEnvFile, pickEnv, readArgs } from './install-utils.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultReleaseRoot = resolve(scriptDir, '..', '..');

function envXml(env) {
  return Object.entries(env)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `  <env name="${escapeXml(name)}" value="${escapeXml(value)}" />`)
    .join('\n');
}

function serviceXml(service) {
  return [
    '<service>',
    `  <id>${escapeXml(service.id)}</id>`,
    `  <name>${escapeXml(service.name)}</name>`,
    `  <description>${escapeXml(service.description)}</description>`,
    ...service.depends.map((dependency) => `  <depend>${escapeXml(dependency)}</depend>`),
    `  <executable>${escapeXml(service.executable)}</executable>`,
    `  <arguments>${escapeXml(service.arguments)}</arguments>`,
    `  <workingdirectory>${escapeXml(service.workingDirectory)}</workingdirectory>`,
    envXml(service.env),
    '  <startmode>Automatic</startmode>',
    '  <onfailure action="restart" delay="10 sec" />',
    '  <log mode="roll-by-size">',
    '    <sizeThreshold>10240</sizeThreshold>',
    '    <keepFiles>10</keepFiles>',
    '  </log>',
    '</service>',
    ''
  ].join('\n');
}

function firstExisting(paths) {
  return paths.find((candidate) => existsSync(candidate)) ?? paths[0];
}

function isTruthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(
    String(value ?? '')
      .trim()
      .toLowerCase()
  );
}

function assertProductionServiceEnv(env) {
  if (env.NODE_ENV && env.NODE_ENV.trim() !== 'production') {
    throw new Error('Windows service manifests must run BellField with NODE_ENV=production.');
  }

  if (isTruthy(env.BOOTSTRAP_SEED_DATA)) {
    throw new Error('Windows service manifests must not enable BOOTSTRAP_SEED_DATA.');
  }
}

const args = readArgs();
const releaseRoot = resolve(String(args['release-root'] ?? defaultReleaseRoot));
const installRoot = resolve(String(args['install-root'] ?? 'C:\\BellField'));
const envPath = resolve(String(args.env ?? join(installRoot, 'bellfield-server.env')));
const outputDir = resolve(String(args.output ?? join(releaseRoot, 'services')));
const env = parseEnvFile(envPath);
assertProductionServiceEnv(env);
const nodeExe = join(releaseRoot, 'runtime', 'node', 'node.exe');
const postgresBin = env.BELLFIELD_POSTGRES_BIN ?? join(releaseRoot, 'postgres', 'bin');
const postgresData = env.BELLFIELD_POSTGRES_DATA ?? join(installRoot, 'data', 'postgres');
const officeServer = firstExisting([
  join(releaseRoot, 'apps', 'office-web', 'server.js'),
  join(releaseRoot, 'apps', 'office-web', 'apps', 'office-web', 'server.js')
]);
const apiEnv = {
  ...pickEnv(env, [
    'DATABASE_URL',
    'BELLFIELD_API_PORT',
    'BELLFIELD_OFFICE_ORIGINS',
    'BELLFIELD_OFFICE_SESSION_TTL_HOURS',
    'BELLFIELD_FIELD_SESSION_TTL_DAYS',
    'BELLFIELD_MEDIA_ROOT',
    'BELLFIELD_MEDIA_TOKEN_SECRET',
    'BELLFIELD_MEDIA_MAX_BYTES',
    'BELLFIELD_MEDIA_TOKEN_TTL_SECONDS',
    'BELLFIELD_LICENSE_REQUIRED',
    'BELLFIELD_LICENSE_PATH',
    'BELLFIELD_BACKUP_ENABLED',
    'BELLFIELD_BACKUP_ROOT',
    'BELLFIELD_BACKUP_RETENTION_COUNT',
    'BELLFIELD_BACKUP_STALE_AFTER_HOURS',
    'BELLFIELD_RELAY_BASE_URL',
    'BELLFIELD_RELAY_TOKEN',
    'BELLFIELD_RELAY_SERVER_INSTANCE_ID'
  ]),
  NODE_ENV: 'production',
  BOOTSTRAP_SEED_DATA: 'false',
  PORT: env.BELLFIELD_API_PORT ?? '3001'
};
// The worker shares the relay client credentials for delivery retry and
// status polling jobs.
const workerEnv = {
  ...pickEnv(env, [
    'DATABASE_URL',
    'BELLFIELD_MEDIA_ROOT',
    'BELLFIELD_LICENSE_PATH',
    'BELLFIELD_BACKUP_ENABLED',
    'BELLFIELD_BACKUP_ROOT',
    'BELLFIELD_BACKUP_INTERVAL_MINUTES',
    'BELLFIELD_BACKUP_RETENTION_COUNT',
    'BELLFIELD_BACKUP_STALE_AFTER_HOURS',
    'BELLFIELD_POSTGRES_BIN',
    'BELLFIELD_PG_DUMP_PATH',
    'BELLFIELD_RELAY_BASE_URL',
    'BELLFIELD_RELAY_TOKEN',
    'BELLFIELD_RELAY_SERVER_INSTANCE_ID'
  ]),
  NODE_ENV: 'production'
};
const officeEnv = {
  ...pickEnv(env, ['BELLFIELD_OFFICE_WEB_PORT', 'NEXT_PUBLIC_API_BASE_URL']),
  NODE_ENV: 'production',
  PORT: env.BELLFIELD_OFFICE_WEB_PORT ?? '3000'
};

mkdirSync(outputDir, { recursive: true });

const services = [
  {
    id: 'bellfield-postgres',
    name: 'BellField PostgreSQL',
    description: 'BellField local PostgreSQL database service.',
    executable: join(postgresBin, 'postgres.exe'),
    arguments: `-D "${postgresData}"`,
    workingDirectory: postgresBin,
    depends: [],
    env: {
      PGDATA: postgresData
    }
  },
  {
    id: 'bellfield-api',
    name: 'BellField API',
    description: 'BellField backend API service.',
    executable: nodeExe,
    arguments: 'dist\\apps\\api\\src\\main.js',
    workingDirectory: join(releaseRoot, 'apps', 'api'),
    depends: ['bellfield-postgres'],
    env: apiEnv
  },
  {
    id: 'bellfield-worker',
    name: 'BellField Worker',
    description: 'BellField background worker service.',
    executable: nodeExe,
    arguments: 'dist\\index.js',
    workingDirectory: join(releaseRoot, 'apps', 'worker'),
    depends: ['bellfield-api'],
    env: workerEnv
  },
  {
    id: 'bellfield-office-web',
    name: 'BellField Office Web',
    description: 'BellField office browser application service.',
    executable: nodeExe,
    arguments: 'server.js',
    workingDirectory: dirname(officeServer),
    depends: ['bellfield-api'],
    env: officeEnv
  }
];

for (const service of services) {
  writeFileSync(join(outputDir, `${service.id}.xml`), serviceXml(service));
}

console.log(`Rendered ${services.length} WinSW service manifests to ${outputDir}`);
