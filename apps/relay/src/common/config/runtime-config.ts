const DEFAULT_PORT = 3201;
const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/bellfield_relay';
const DEFAULT_FROM_ADDRESS = 'estimates@bellfield.app';
const DEFAULT_MONTHLY_SEND_QUOTA = 1000;
const DEFAULT_REBIND_FLAP_THRESHOLD = 5;
const DEFAULT_REBIND_FLAP_WINDOW_MINUTES = 60;
const DEFAULT_PUBLIC_BASE_URL = 'https://relay.bellfield.app';
const DEFAULT_PAYMENTS_PLATFORM_FEE_BASIS_POINTS = 100;

export type RelayNodeEnv = 'development' | 'test' | 'production';

export type RelayRuntimeConfig = {
  nodeEnv: RelayNodeEnv;
  port: number;
  databaseUrl: string;
  /** The only provider credential anywhere in the product — relay-side only. */
  resendApiKey?: string;
  fromAddress: string;
  webhookSigningSecret?: string;
  defaultMonthlySendQuota: number;
  rebindFlapThreshold: number;
  rebindFlapWindowMinutes: number;
  /** Directory holding published release artifacts; unset disables downloads. */
  artifactsRoot?: string;
  /** Origin used to compose public acceptance-link URLs. */
  publicBaseUrl: string;
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  paymentsPlatformFeeBasisPoints: number;
};

function getNodeEnv(): RelayNodeEnv {
  const value = process.env.NODE_ENV;
  if (value === 'production' || value === 'test') {
    return value;
  }
  return 'development';
}

function readPositiveInteger(name: string, fallback: number, problems: string[]): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    problems.push(`${name} must be a positive integer.`);
    return fallback;
  }
  return parsed;
}

export function getRelayRuntimeConfig(): RelayRuntimeConfig {
  const nodeEnv = getNodeEnv();
  const problems: string[] = [];

  const databaseUrl = process.env.BELLFIELD_RELAY_DATABASE_URL ?? '';
  const resendApiKey = process.env.BELLFIELD_RELAY_RESEND_API_KEY || undefined;
  const fromAddress = process.env.BELLFIELD_RELAY_FROM_ADDRESS || DEFAULT_FROM_ADDRESS;
  const webhookSigningSecret = process.env.BELLFIELD_RELAY_WEBHOOK_SIGNING_SECRET || undefined;
  const stripeSecretKey = process.env.BELLFIELD_RELAY_STRIPE_SECRET_KEY || undefined;
  const stripeWebhookSecret = process.env.BELLFIELD_RELAY_STRIPE_WEBHOOK_SECRET || undefined;
  const port = readPositiveInteger('BELLFIELD_RELAY_PORT', DEFAULT_PORT, problems);
  const defaultMonthlySendQuota = readPositiveInteger(
    'BELLFIELD_RELAY_DEFAULT_MONTHLY_QUOTA',
    DEFAULT_MONTHLY_SEND_QUOTA,
    problems
  );
  const rebindFlapThreshold = readPositiveInteger(
    'BELLFIELD_RELAY_REBIND_FLAP_THRESHOLD',
    DEFAULT_REBIND_FLAP_THRESHOLD,
    problems
  );
  const rebindFlapWindowMinutes = readPositiveInteger(
    'BELLFIELD_RELAY_REBIND_FLAP_WINDOW_MINUTES',
    DEFAULT_REBIND_FLAP_WINDOW_MINUTES,
    problems
  );
  const paymentsPlatformFeeBasisPoints = readPositiveInteger(
    'BELLFIELD_RELAY_PAYMENTS_PLATFORM_FEE_BASIS_POINTS',
    DEFAULT_PAYMENTS_PLATFORM_FEE_BASIS_POINTS,
    problems
  );

  if (nodeEnv === 'production') {
    if (!databaseUrl) {
      problems.push('BELLFIELD_RELAY_DATABASE_URL is required in production.');
    }
    if (!resendApiKey) {
      problems.push('BELLFIELD_RELAY_RESEND_API_KEY is required in production.');
    }
    if (!fromAddress.includes('@')) {
      problems.push('BELLFIELD_RELAY_FROM_ADDRESS must be an email address.');
    }
  }
  if ((stripeSecretKey && !stripeWebhookSecret) || (!stripeSecretKey && stripeWebhookSecret)) {
    problems.push(
      'BELLFIELD_RELAY_STRIPE_SECRET_KEY and BELLFIELD_RELAY_STRIPE_WEBHOOK_SECRET must be set together.'
    );
  }

  if (problems.length > 0) {
    throw new Error(`Relay runtime configuration is invalid: ${problems.join(' ')}`);
  }

  return {
    nodeEnv,
    port,
    databaseUrl: databaseUrl || DEFAULT_DATABASE_URL,
    resendApiKey,
    fromAddress,
    webhookSigningSecret,
    defaultMonthlySendQuota,
    rebindFlapThreshold,
    rebindFlapWindowMinutes,
    artifactsRoot: process.env.BELLFIELD_RELAY_ARTIFACTS_ROOT?.trim() || undefined,
    publicBaseUrl: (process.env.BELLFIELD_RELAY_PUBLIC_BASE_URL?.trim() || DEFAULT_PUBLIC_BASE_URL)
      // A trailing slash would produce //a/<token> URLs.
      .replace(/\/+$/, ''),
    stripeSecretKey,
    stripeWebhookSecret,
    paymentsPlatformFeeBasisPoints
  };
}
