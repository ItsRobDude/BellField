import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultReleaseRoot = resolve(scriptDir, '..', '..');

function readArgs() {
  return Object.fromEntries(
    process.argv
      .slice(2)
      .filter((arg) => arg.startsWith('--'))
      .map((arg) => {
        const [key, ...value] = arg.slice(2).split('=');
        return [key, value.join('=') || 'true'];
      })
  );
}

function parseEnvFile(path) {
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index), line.slice(index + 1)];
      })
  );
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

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
    '    <sizeThreshold>10485760</sizeThreshold>',
    '    <keepFiles>10</keepFiles>',
    '  </log>',
    '</service>',
    ''
  ].join('\n');
}

function firstExisting(paths) {
  return paths.find((candidate) => existsSync(candidate)) ?? paths[0];
}

const args = readArgs();
const releaseRoot = resolve(String(args['release-root'] ?? defaultReleaseRoot));
const installRoot = resolve(String(args['install-root'] ?? 'C:\\BellField'));
const envPath = resolve(String(args.env ?? join(installRoot, 'bellfield-server.env')));
const outputDir = resolve(String(args.output ?? join(releaseRoot, 'services')));
const env = parseEnvFile(envPath);
const nodeExe = join(releaseRoot, 'runtime', 'node', 'node.exe');
const postgresBin = env.BELLFIELD_POSTGRES_BIN ?? join(releaseRoot, 'postgres', 'bin');
const postgresData = env.BELLFIELD_POSTGRES_DATA ?? join(installRoot, 'data', 'postgres');
const officeServer = firstExisting([
  join(releaseRoot, 'apps', 'office-web', 'server.js'),
  join(releaseRoot, 'apps', 'office-web', 'apps', 'office-web', 'server.js')
]);

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
    env
  },
  {
    id: 'bellfield-api',
    name: 'BellField API',
    description: 'BellField backend API service.',
    executable: nodeExe,
    arguments: 'dist\\apps\\api\\src\\main.js',
    workingDirectory: join(releaseRoot, 'apps', 'api'),
    depends: ['bellfield-postgres'],
    env: { ...env, PORT: env.BELLFIELD_API_PORT ?? '3001' }
  },
  {
    id: 'bellfield-worker',
    name: 'BellField Worker',
    description: 'BellField background worker service.',
    executable: nodeExe,
    arguments: 'dist\\index.js',
    workingDirectory: join(releaseRoot, 'apps', 'worker'),
    depends: ['bellfield-api'],
    env
  },
  {
    id: 'bellfield-office-web',
    name: 'BellField Office Web',
    description: 'BellField office browser application service.',
    executable: nodeExe,
    arguments: 'server.js',
    workingDirectory: dirname(officeServer),
    depends: ['bellfield-api'],
    env: { ...env, PORT: env.BELLFIELD_OFFICE_WEB_PORT ?? '3000' }
  }
];

for (const service of services) {
  writeFileSync(join(outputDir, `${service.id}.xml`), serviceXml(service));
}

console.log(`Rendered ${services.length} WinSW service manifests to ${outputDir}`);
