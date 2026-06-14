import { EmailProviderService } from './email-provider.service';
import type { EmailProviderSendInput } from './customer-delivery.types';

const originalFetch = global.fetch;
const relayEnvKeys = [
  'BELLFIELD_RELAY_BASE_URL',
  'BELLFIELD_RELAY_TOKEN',
  'BELLFIELD_RELAY_SERVER_INSTANCE_ID'
] as const;
const originalRelayEnv = relayEnvKeys.map((key) => [key, process.env[key]] as const);

function configureRelayEnv() {
  process.env.BELLFIELD_RELAY_BASE_URL = 'https://relay.bellfield.app';
  process.env.BELLFIELD_RELAY_TOKEN = 'bfrt1_0123456789abcdef_' + 'a'.repeat(64);
  process.env.BELLFIELD_RELAY_SERVER_INSTANCE_ID = 'instance-uuid-1';
}

function clearRelayEnv() {
  for (const key of relayEnvKeys) {
    delete process.env[key];
  }
}

function makeInput(): EmailProviderSendInput {
  return {
    to: 'homeowner@example.com',
    fromName: 'Acme Heating',
    replyToEmail: 'office@acmeheating.example',
    subject: 'Your estimate',
    bodyText: 'Estimate attached.',
    attachment: {
      filename: 'estimate.pdf',
      contentType: 'application/pdf',
      bytes: Buffer.from('%PDF-1.7 test')
    },
    idempotencyKey: 'estimate-send-msg-1'
  };
}

afterEach(() => {
  global.fetch = originalFetch;
  for (const [key, value] of originalRelayEnv) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe('EmailProviderService.sendEstimateEmail', () => {
  it('fails as notConfigured when relay credentials are absent', async () => {
    clearRelayEnv();
    const service = new EmailProviderService();

    const result = await service.sendEstimateEmail(makeInput());

    expect(result).toMatchObject({ kind: 'failed', code: 'notConfigured', retryable: false });
  });

  it('posts the document send to the relay with auth and instance headers', async () => {
    configureRelayEnv();
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        result: { kind: 'sent', relayMessageId: 'relay-1', providerMessageId: 'prov-1' }
      })
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const service = new EmailProviderService();

    const result = await service.sendEstimateEmail(makeInput());

    expect(result).toEqual({ kind: 'sent', providerMessageId: 'relay-1' });
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://relay.bellfield.app/v1/messages/send');
    const headers = options.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${process.env.BELLFIELD_RELAY_TOKEN}`);
    expect(headers['x-bellfield-server-instance']).toBe('instance-uuid-1');
    const body = JSON.parse(String(options.body)) as {
      idempotencyKey: string;
      documentType: string;
      recipientEmail: string;
      fromName: string;
      document: { filename: string; contentType: string; bytesBase64: string };
    };
    expect(body.idempotencyKey).toBe('estimate-send-msg-1');
    expect(body.documentType).toBe('estimate');
    expect(body.recipientEmail).toBe('homeowner@example.com');
    expect(body.fromName).toBe('Acme Heating');
    expect(Buffer.from(body.document.bytesBase64, 'base64').toString('utf8')).toBe('%PDF-1.7 test');
  });

  it('posts invoice sends with invoice document type for relay sender selection', async () => {
    configureRelayEnv();
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        result: { kind: 'sent', relayMessageId: 'relay-invoice-1' }
      })
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const service = new EmailProviderService();

    const result = await service.sendInvoiceEmail({
      ...makeInput(),
      subject: 'Your invoice',
      idempotencyKey: 'invoice-send-msg-1',
      attachment: {
        filename: 'invoice.pdf',
        contentType: 'application/pdf',
        bytes: Buffer.from('%PDF-1.7 invoice')
      }
    });

    expect(result).toEqual({ kind: 'sent', providerMessageId: 'relay-invoice-1' });
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(options.body)) as {
      documentType: string;
      idempotencyKey: string;
    };
    expect(body.documentType).toBe('invoice');
    expect(body.idempotencyKey).toBe('invoice-send-msg-1');
  });

  it('passes through relay failure codes and retryability', async () => {
    configureRelayEnv();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        result: {
          kind: 'failed',
          code: 'sendingLimitReached',
          retryable: false,
          message: 'limit'
        }
      })
    }) as unknown as typeof fetch;
    const service = new EmailProviderService();

    const result = await service.sendEstimateEmail(makeInput());

    expect(result).toMatchObject({
      kind: 'failed',
      code: 'sendingLimitReached',
      retryable: false
    });
  });

  it('maps relay-side notConfigured to unavailability, not install misconfig', async () => {
    configureRelayEnv();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        result: { kind: 'failed', code: 'notConfigured', retryable: true, message: 'ops' }
      })
    }) as unknown as typeof fetch;
    const service = new EmailProviderService();

    const result = await service.sendEstimateEmail(makeInput());

    expect(result).toMatchObject({ kind: 'failed', code: 'deliveryUnavailable', retryable: true });
  });

  it('treats 401 and 403 as non-retryable credential rejection', async () => {
    configureRelayEnv();
    for (const status of [401, 403]) {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status,
        json: async () => ({})
      }) as unknown as typeof fetch;
      const service = new EmailProviderService();

      const result = await service.sendEstimateEmail(makeInput());

      expect(result).toMatchObject({ kind: 'failed', code: 'deliveryRejected', retryable: false });
    }
  });

  it('treats relay 5xx as retryable unavailability', async () => {
    configureRelayEnv();
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({})
    }) as unknown as typeof fetch;
    const service = new EmailProviderService();

    const result = await service.sendEstimateEmail(makeInput());

    expect(result).toMatchObject({ kind: 'failed', code: 'deliveryUnavailable', retryable: true });
  });

  it('treats network failure as retryable unavailability', async () => {
    configureRelayEnv();
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('socket hang up')) as unknown as typeof fetch;
    const service = new EmailProviderService();

    const result = await service.sendEstimateEmail(makeInput());

    expect(result).toMatchObject({ kind: 'failed', code: 'deliveryUnavailable', retryable: true });
  });

  it('fails closed on an unrecognized relay response shape', async () => {
    configureRelayEnv();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ something: 'else' })
    }) as unknown as typeof fetch;
    const service = new EmailProviderService();

    const result = await service.sendEstimateEmail(makeInput());

    expect(result).toMatchObject({ kind: 'failed', code: 'unknown', retryable: false });
  });
});

describe('EmailProviderService.getEstimateEmailDeliveryStatus', () => {
  it('reports needsSetup and not configured without relay credentials', async () => {
    clearRelayEnv();
    const service = new EmailProviderService();

    const status = await service.getEstimateEmailDeliveryStatus();

    expect(status).toMatchObject({ configured: false, ready: false, status: 'needsSetup' });
    expect(status.message).not.toMatch(/relay|resend|token/i);
  });

  it('reports ready from relay entitlement', async () => {
    configureRelayEnv();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        shopId: 'shop_1',
        sendingState: 'ready',
        monthlySendQuota: 100,
        remainingThisMonth: 90
      })
    }) as unknown as typeof fetch;
    const service = new EmailProviderService();

    const status = await service.getEstimateEmailDeliveryStatus();

    expect(status).toMatchObject({ configured: true, ready: true, status: 'ready' });
  });

  it('reports quotaExhausted from relay entitlement', async () => {
    configureRelayEnv();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        shopId: 'shop_1',
        sendingState: 'quotaExhausted',
        monthlySendQuota: 100,
        remainingThisMonth: 0
      })
    }) as unknown as typeof fetch;
    const service = new EmailProviderService();

    const status = await service.getEstimateEmailDeliveryStatus();

    expect(status).toMatchObject({ configured: true, ready: false, status: 'quotaExhausted' });
    expect(status.message).not.toMatch(/relay|resend|token/i);
  });

  it('reports suspended on relay 403', async () => {
    configureRelayEnv();
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({})
    }) as unknown as typeof fetch;
    const service = new EmailProviderService();

    const status = await service.getEstimateEmailDeliveryStatus();

    expect(status).toMatchObject({ configured: true, ready: false, status: 'suspended' });
    expect(status.message).not.toMatch(/relay|resend|token/i);
  });

  it('reports needsSetup on relay 401', async () => {
    configureRelayEnv();
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({})
    }) as unknown as typeof fetch;
    const service = new EmailProviderService();

    const status = await service.getEstimateEmailDeliveryStatus();

    expect(status).toMatchObject({ configured: true, ready: false, status: 'needsSetup' });
  });

  it('reports temporarilyUnavailable when the relay is unreachable', async () => {
    configureRelayEnv();
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('connect ECONNREFUSED')) as unknown as typeof fetch;
    const service = new EmailProviderService();

    const status = await service.getEstimateEmailDeliveryStatus();

    expect(status).toMatchObject({
      configured: true,
      ready: false,
      status: 'temporarilyUnavailable'
    });
  });
});
