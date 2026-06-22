const setupTokenPrefix = 'BellField first-owner setup token:';
const setupToken = 'setupTokenSecret_123';
const relayToken = ['bfrt1', 'relaySecretValue123'].join('_');
const postgresUrl = (password) =>
  ['postgresql://bellfield:', password, '@127.0.0.1:5432/bellfield'].join('');
const pemPrivateKeyBlock = [
  ['-----BEGIN R', 'SA PRIVATE KEY-----'].join(''),
  'private-key-secret-line',
  ['-----END R', 'SA PRIVATE KEY-----'].join('')
].join('\n');

export const REDACTION_SECRET_FIXTURES = [
  {
    name: 'setup token without trailing punctuation',
    input: `${setupTokenPrefix} ${setupToken}`,
    secrets: [setupToken]
  },
  {
    name: 'setup token with trailing punctuation',
    input: `${setupTokenPrefix} ${setupToken}. Use it once.`,
    secrets: [setupToken]
  },
  {
    name: 'database URL env value',
    input: `DATABASE_URL=${postgresUrl('dbPasswordSecret')}`,
    secrets: ['dbPasswordSecret']
  },
  {
    name: 'quoted database URL env value',
    input: `DATABASE_URL="${postgresUrl('quotedDbPasswordSecret')}"`,
    secrets: ['quotedDbPasswordSecret']
  },
  {
    name: 'pg password env value',
    input: 'PGPASSWORD=pgPasswordSecret',
    secrets: ['pgPasswordSecret']
  },
  {
    name: 'pg password colon value',
    input: 'PGPASSWORD: pgPasswordColonSecret',
    secrets: ['pgPasswordColonSecret']
  },
  {
    name: 'libpq keyword password',
    input: 'host=127.0.0.1 port=5432 password=keywordPasswordSecret dbname=bellfield',
    secrets: ['keywordPasswordSecret']
  },
  {
    name: 'relay token',
    input: ['BELLFIELD_RELAY_TOKEN', relayToken].join('='),
    secrets: [relayToken, 'relaySecretValue123']
  },
  {
    name: 'media token secret',
    input: 'BELLFIELD_MEDIA_TOKEN_SECRET=mediaTokenSecret123',
    secrets: ['mediaTokenSecret123']
  },
  {
    name: 'json token and password fields',
    input: JSON.stringify({
      setupToken: 'jsonSetupSecret',
      sessionToken: 'jsonSessionSecret',
      password: 'jsonPasswordSecret'
    }),
    secrets: ['jsonSetupSecret', 'jsonSessionSecret', 'jsonPasswordSecret']
  },
  {
    name: 'bearer token',
    input: 'Authorization: Bearer bearerSecretTokenValue123456',
    secrets: ['bearerSecretTokenValue123456']
  },
  {
    name: 'generic token assignment',
    input: 'token=genericTokenSecretValue123456',
    secrets: ['genericTokenSecretValue123456']
  },
  {
    name: 'private key block',
    input: pemPrivateKeyBlock,
    secrets: ['private-key-secret-line']
  }
];

export function redactSensitiveText(value) {
  // Evidence bundles are shareable, so generic token/password forms are
  // intentionally over-redacted even when a particular occurrence is benign.
  return String(value)
    .replace(/(BellField first-owner setup token:\s*)[A-Za-z0-9_-]+/gi, '$1[REDACTED]')
    .replace(/\b(?:postgresql|postgres):\/\/[^\s'"`]+/gi, 'postgresql://[REDACTED]')
    .replace(
      /\b(DATABASE_URL|BELLFIELD_RELAY_TOKEN|BELLFIELD_MEDIA_TOKEN_SECRET|PGPASSWORD)\b(\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s'"`,;]+)/gi,
      '$1$2[REDACTED]'
    )
    .replace(/\b(password\s*=\s*)("[^"]*"|'[^']*'|[^\s'"`,;]+)/gi, '$1[REDACTED]')
    .replace(
      /("?(?:setupToken|sessionToken|password|databaseUrl|relayToken|mediaTokenSecret)"?\s*:\s*)("[^"]*"|'[^']*'|[^\s,}]+)/gi,
      '$1"[REDACTED]"'
    )
    .replace(/\bbfrt1_[A-Za-z0-9._-]+/gi, 'bfrt1_[REDACTED]')
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]{16,}/gi, '$1[REDACTED]')
    .replace(
      /\b((?:token|relayToken|setupToken|sessionToken|accessToken|refreshToken)\s*[:=]\s*)("[^"]*"|'[^']*'|[A-Za-z0-9._~+/=-]{16,})/gi,
      '$1[REDACTED]'
    )
    .replace(
      /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/gi,
      '[REDACTED PRIVATE KEY BLOCK]'
    );
}

export function assertNoSensitiveRedactionLeaks(
  redactor = redactSensitiveText,
  fixtures = REDACTION_SECRET_FIXTURES
) {
  const leaks = [];
  for (const fixture of fixtures) {
    const redacted = redactor(fixture.input);
    for (const secret of fixture.secrets) {
      if (redacted.includes(secret)) {
        leaks.push({ fixture: fixture.name, secret });
      }
    }
  }

  if (leaks.length > 0) {
    throw new Error(`Sensitive redaction leaked ${JSON.stringify(leaks)}`);
  }
}
