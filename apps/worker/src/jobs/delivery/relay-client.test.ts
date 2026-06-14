import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RelayClient } from './relay-client';

const originalFetch = global.fetch;

test.afterEach(() => {
  global.fetch = originalFetch;
});

void test('RelayClient posts customer document sends to the generic relay route', async () => {
  const calls: [string, RequestInit][] = [];
  global.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push([String(url), init ?? {}]);
    return {
      ok: true,
      status: 200,
      json: async () => ({ result: { kind: 'sent', relayMessageId: 'relay-1' } })
    } as Response;
  }) as typeof fetch;

  const client = new RelayClient({
    baseUrl: 'https://relay.bellfield.app',
    token: 'relay-token',
    serverInstanceId: 'instance-1'
  });

  const result = await client.sendEstimateDocument({
    idempotencyKey: 'invoice-send-message-1',
    documentType: 'invoice',
    recipientEmail: 'customer@example.com',
    fromName: 'Acme HVAC',
    subject: 'Your invoice',
    bodyText: 'Invoice attached.',
    document: { filename: 'invoice.pdf', bytes: Buffer.from('%PDF-1.7 invoice') }
  });

  assert.equal(result.kind, 'sent');
  assert.equal(result.relayMessageId, 'relay-1');
  assert.equal(calls[0][0], 'https://relay.bellfield.app/v1/messages/send');
  const body = JSON.parse(String(calls[0][1].body)) as {
    documentType: string;
    idempotencyKey: string;
  };
  assert.equal(body.documentType, 'invoice');
  assert.equal(body.idempotencyKey, 'invoice-send-message-1');
});
