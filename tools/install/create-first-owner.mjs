import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readArgs } from './install-utils.mjs';
import { redactSensitiveText } from './sensitive-redaction.mjs';

// Gate Day first-owner automation. Rerun-29 stalled because the operator was
// briefed without the documented Gate Day dummy credential and improvised a
// password the product correctly rejects (12-character owner minimum,
// PR #52). The gate runner now creates the standard test owner itself so no
// human ever types credentials during a strict run; the browser proof becomes
// sign-in + job booking instead of account creation.
//
// The dummy credential below is the intentionally public, non-production
// Gate Day test credential documented in docs/gate-day-checklist.md. It is
// only used when --use-gate-day-dummy-credential is passed explicitly, so no
// real install path can create a publicly known owner by accident.
const GATE_DAY_DUMMY_CREDENTIAL = {
  email: 'gate.owner@example.com',
  displayName: 'Gate Day Owner',
  password: 'BellFieldGateDay!2026'
};

const TOKEN_PATTERN = /BellField first-owner setup token: ([A-Za-z0-9_-]+)\./;

export function extractLatestSetupToken(apiLogRoot, { readDir, readFile, fileStat } = {}) {
  const listDirectory = readDir ?? ((dir) => readdirSync(dir));
  const readText = readFile ?? ((file) => readFileSync(file, 'utf8'));
  const statFile = fileStat ?? ((file) => statSync(file));

  if (!existsSync(apiLogRoot)) {
    throw new Error(
      `BellField API service log directory not found: ${apiLogRoot}. Confirm bellfield-api is installed and running.`
    );
  }

  const logFiles = listDirectory(apiLogRoot)
    .filter((name) => name.endsWith('.log'))
    .map((name) => {
      const fullPath = join(apiLogRoot, name);
      return { fullPath, mtimeMs: statFile(fullPath).mtimeMs };
    })
    .sort((a, b) => a.mtimeMs - b.mtimeMs || a.fullPath.localeCompare(b.fullPath));

  let latest = null;
  for (const file of logFiles) {
    for (const line of readText(file.fullPath).split(/\r?\n/)) {
      const match = TOKEN_PATTERN.exec(line);
      if (match) {
        latest = match[1];
      }
    }
  }

  if (!latest) {
    throw new Error(
      `No first-owner setup token line was found under ${apiLogRoot}. Confirm bellfield-api is running and GET /identity/setup/status has been called.`
    );
  }
  return latest;
}

export function resolveOwnerCredential(args) {
  // readArgs() yields the string 'true' for bare --flags.
  const dummyFlag = args['use-gate-day-dummy-credential'];
  const useDummy = dummyFlag === true || dummyFlag === 'true';
  const email = args.email ? String(args.email) : null;
  const displayName = args['display-name'] ? String(args['display-name']) : null;
  const password = args.password ? String(args.password) : null;

  if (useDummy) {
    if (email || displayName || password) {
      throw new Error(
        '--use-gate-day-dummy-credential cannot be combined with --email/--display-name/--password.'
      );
    }
    return { ...GATE_DAY_DUMMY_CREDENTIAL, usedGateDayDummyCredential: true };
  }

  if (!email || !displayName || !password) {
    throw new Error(
      'Provide --email, --display-name, and --password, or pass --use-gate-day-dummy-credential explicitly for the documented Gate Day test owner.'
    );
  }
  return { email, displayName, password, usedGateDayDummyCredential: false };
}

async function main() {
  const args = readArgs();
  const installRoot = resolve(String(args['install-root'] ?? 'C:\\BellField'));
  const apiBaseUrl = String(args['api-base-url'] ?? 'http://127.0.0.1:3001').replace(/\/+$/, '');
  const timeoutMs = Number(args['timeout-ms'] ?? 30_000);
  const credential = resolveOwnerCredential(args);

  const statusResponse = await fetchJson(`${apiBaseUrl}/identity/setup/status`, {
    method: 'GET',
    timeoutMs
  });
  if (statusResponse.body?.setupRequired === false) {
    throw new Error(
      'First-owner setup is already complete on this install; refusing to create another owner. Use a clean install for a strict Gate Day run.'
    );
  }

  const apiLogRoot = join(installRoot, 'data', 'logs', 'services', 'bellfield-api');
  const setupToken = extractLatestSetupToken(apiLogRoot);

  const createResponse = await fetchJson(`${apiBaseUrl}/identity/setup/first-owner`, {
    method: 'POST',
    body: {
      setupToken,
      email: credential.email,
      displayName: credential.displayName,
      password: credential.password
    },
    timeoutMs
  });

  if (!createResponse.ok) {
    const detail =
      typeof createResponse.body === 'object'
        ? JSON.stringify(createResponse.body)
        : String(createResponse.body ?? '');
    throw new Error(
      `First-owner creation failed with HTTP ${createResponse.status}: ${detail || 'no response body'}`
    );
  }

  console.log(
    JSON.stringify(
      {
        status: 'created',
        email: credential.email,
        displayName: credential.displayName,
        usedGateDayDummyCredential: credential.usedGateDayDummyCredential
      },
      null,
      2
    )
  );
}

async function fetchJson(url, { method, body, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    let parsed = null;
    const text = await response.text();
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    return { ok: response.ok, status: response.status, body: parsed };
  } catch (error) {
    throw new Error(
      `Request to ${url} failed: ${error instanceof Error ? error.message : String(error)}`
    );
  } finally {
    clearTimeout(timer);
  }
}

const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === (process.argv[1] ?? '');

if (invokedDirectly) {
  main().catch((error) => {
    console.error(redactSensitiveText(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  });
}
