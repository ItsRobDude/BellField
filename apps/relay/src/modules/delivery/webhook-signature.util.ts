import { createHmac, timingSafeEqual } from 'node:crypto';

const TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

export type WebhookSignatureHeaders = {
  id: string | undefined;
  timestamp: string | undefined;
  signature: string | undefined;
};

/**
 * Verifies a Svix-style webhook signature (the scheme Resend uses): the
 * signed content is `${id}.${timestamp}.${rawBody}`, HMAC-SHA256 with the
 * base64 secret after the `whsec_` prefix, compared against any of the
 * space-delimited `v1,<base64>` entries in the signature header. Stale
 * timestamps are rejected to blunt replay.
 */
export function verifyWebhookSignature(input: {
  secret: string;
  headers: WebhookSignatureHeaders;
  rawBody: Buffer;
  now: Date;
}): boolean {
  const { id, timestamp, signature } = input.headers;
  if (!id || !timestamp || !signature) {
    return false;
  }

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) {
    return false;
  }
  const ageSeconds = Math.abs(input.now.getTime() / 1000 - timestampSeconds);
  if (ageSeconds > TIMESTAMP_TOLERANCE_SECONDS) {
    return false;
  }

  const secretBase64 = input.secret.startsWith('whsec_')
    ? input.secret.slice('whsec_'.length)
    : input.secret;
  let secretBytes: Buffer;
  try {
    secretBytes = Buffer.from(secretBase64, 'base64');
  } catch {
    return false;
  }
  if (secretBytes.length === 0) {
    return false;
  }

  const signedContent = `${id}.${timestamp}.${input.rawBody.toString('utf8')}`;
  const expected = createHmac('sha256', secretBytes).update(signedContent, 'utf8').digest();

  return signature.split(' ').some((candidate) => {
    const [version, value] = candidate.split(',');
    if (version !== 'v1' || !value) {
      return false;
    }
    let candidateBytes: Buffer;
    try {
      candidateBytes = Buffer.from(value, 'base64');
    } catch {
      return false;
    }
    return candidateBytes.length === expected.length && timingSafeEqual(candidateBytes, expected);
  });
}
