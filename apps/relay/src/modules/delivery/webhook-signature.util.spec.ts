import { createHmac } from 'node:crypto';
import { verifyWebhookSignature } from './webhook-signature.util';

const secretBytes = Buffer.from('test-webhook-secret-material');
const secret = `whsec_${secretBytes.toString('base64')}`;
const now = new Date('2026-06-11T12:00:00.000Z');
const nowSeconds = Math.floor(now.getTime() / 1000);

function sign(id: string, timestamp: string, rawBody: Buffer): string {
  const signedContent = `${id}.${timestamp}.${rawBody.toString('utf8')}`;
  return createHmac('sha256', secretBytes).update(signedContent, 'utf8').digest('base64');
}

describe('verifyWebhookSignature', () => {
  const rawBody = Buffer.from(JSON.stringify({ type: 'email.delivered' }));

  it('accepts a correctly signed payload', () => {
    const timestamp = String(nowSeconds);
    const signature = `v1,${sign('msg_1', timestamp, rawBody)}`;

    expect(
      verifyWebhookSignature({
        secret,
        headers: { id: 'msg_1', timestamp, signature },
        rawBody,
        now
      })
    ).toBe(true);
  });

  it('accepts when any of several signatures match', () => {
    const timestamp = String(nowSeconds);
    const signature = `v1,${Buffer.from('garbage').toString('base64')} v1,${sign('msg_1', timestamp, rawBody)}`;

    expect(
      verifyWebhookSignature({
        secret,
        headers: { id: 'msg_1', timestamp, signature },
        rawBody,
        now
      })
    ).toBe(true);
  });

  it('rejects a tampered body', () => {
    const timestamp = String(nowSeconds);
    const signature = `v1,${sign('msg_1', timestamp, rawBody)}`;

    expect(
      verifyWebhookSignature({
        secret,
        headers: { id: 'msg_1', timestamp, signature },
        rawBody: Buffer.from('{"type":"email.bounced"}'),
        now
      })
    ).toBe(false);
  });

  it('rejects a wrong secret', () => {
    const timestamp = String(nowSeconds);
    const signature = `v1,${sign('msg_1', timestamp, rawBody)}`;

    expect(
      verifyWebhookSignature({
        secret: `whsec_${Buffer.from('other-secret').toString('base64')}`,
        headers: { id: 'msg_1', timestamp, signature },
        rawBody,
        now
      })
    ).toBe(false);
  });

  it('rejects stale timestamps', () => {
    const stale = String(nowSeconds - 6 * 60);
    const signature = `v1,${sign('msg_1', stale, rawBody)}`;

    expect(
      verifyWebhookSignature({
        secret,
        headers: { id: 'msg_1', timestamp: stale, signature },
        rawBody,
        now
      })
    ).toBe(false);
  });

  it('rejects missing headers', () => {
    expect(
      verifyWebhookSignature({
        secret,
        headers: { id: undefined, timestamp: String(nowSeconds), signature: 'v1,abc' },
        rawBody,
        now
      })
    ).toBe(false);
    expect(
      verifyWebhookSignature({
        secret,
        headers: { id: 'msg_1', timestamp: undefined, signature: 'v1,abc' },
        rawBody,
        now
      })
    ).toBe(false);
    expect(
      verifyWebhookSignature({
        secret,
        headers: { id: 'msg_1', timestamp: String(nowSeconds), signature: undefined },
        rawBody,
        now
      })
    ).toBe(false);
  });

  it('rejects non-v1 signature entries', () => {
    const timestamp = String(nowSeconds);
    const signature = `v2,${sign('msg_1', timestamp, rawBody)}`;

    expect(
      verifyWebhookSignature({
        secret,
        headers: { id: 'msg_1', timestamp, signature },
        rawBody,
        now
      })
    ).toBe(false);
  });
});
