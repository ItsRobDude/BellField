import { readFileSync } from 'node:fs';

export function readArgs(argv = process.argv) {
  return Object.fromEntries(
    argv
      .slice(2)
      .filter((arg) => arg.startsWith('--'))
      .map((arg) => {
        const [key, ...value] = arg.slice(2).split('=');
        return [key, value.join('=') || 'true'];
      })
  );
}

export function parseEnvFile(path) {
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const index = line.indexOf('=');
        if (index === -1) {
          return [line, ''];
        }
        return [line.slice(0, index), line.slice(index + 1)];
      })
  );
}

export function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function getBoolean(value, defaultValue) {
  if (value === undefined) {
    return defaultValue;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  return defaultValue;
}

export function pickEnv(source, names) {
  return Object.fromEntries(
    names.filter((name) => Object.hasOwn(source, name)).map((name) => [name, source[name]])
  );
}

export function databaseConfigFromUrl(databaseUrl) {
  const url = new URL(databaseUrl);
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!databaseName) {
    throw new Error('DATABASE_URL must include a database name.');
  }
  if (!url.username) {
    throw new Error('DATABASE_URL must include a database user.');
  }
  if (!url.password) {
    throw new Error('DATABASE_URL must include a database password.');
  }

  return {
    host: url.hostname || '127.0.0.1',
    port: url.port || '5432',
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    databaseName
  };
}
