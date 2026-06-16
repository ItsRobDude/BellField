import { formatFrom, ResendEmailAdapter } from './resend-email.adapter';
import type { ProviderSendInput } from './relay-delivery.types';

const originalFetch = global.fetch;
const originalEnv = { ...process.env };

function makeInput(): ProviderSendInput {
  return {
    sender: 'estimate',
    fromName: 'Acme HVAC',
    to: 'homeowner@example.com',
    replyToEmail: 'office@acmehvac.example',
    subject: 'Your estimate',
    bodyText: 'Estimate attached.',
    attachment: {
      filename: 'estimate.pdf',
      contentType: 'application/pdf',
      bytes: Buffer.from('%PDF-1.7 test')
    },
    idempotencyKey: 'relay/shop_1/estimate-send-msg-1'
  };
}

describe('ResendEmailAdapter', () => {
  beforeEach(() => {
    process.env.BELLFIELD_RELAY_RESEND_API_KEY = 're_test_key';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  it('fails retryable when the relay has no provider key (ops outage, not install misconfig)', async () => {
    delete process.env.BELLFIELD_RELAY_RESEND_API_KEY;
    const adapter = new ResendEmailAdapter();

    const result = await adapter.send(makeInput());

    expect(result).toMatchObject({ kind: 'failed', code: 'deliveryUnavailable', retryable: true });
  });

  it('sends the composed message and returns the provider message id', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'prov-123' })
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const adapter = new ResendEmailAdapter();

    const result = await adapter.send(makeInput());

    expect(result).toEqual({ kind: 'sent', providerMessageId: 'prov-123' });
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    const body = JSON.parse(String(options.body)) as Record<string, unknown>;
    expect(body.from).toBe('"Acme HVAC" <estimates@bellfield.app>');
    expect(body.to).toEqual(['homeowner@example.com']);
    expect(body.reply_to).toEqual(['office@acmehvac.example']);
    const headers = options.headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toBe('relay/shop_1/estimate-send-msg-1');
  });

  it('uses the configured invoice sender for invoice documents', async () => {
    process.env.BELLFIELD_RELAY_INVOICE_FROM_ADDRESS = 'billing@bellfield.app';
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'prov-invoice-123' })
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const adapter = new ResendEmailAdapter();

    await adapter.send({
      ...makeInput(),
      sender: 'invoice',
      attachment: {
        filename: 'invoice.pdf',
        contentType: 'application/pdf',
        bytes: Buffer.from('%PDF-1.7 invoice')
      },
      idempotencyKey: 'relay/shop_1/invoice-send-msg-1'
    });

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(options.body)) as Record<string, unknown>;
    expect(body.from).toBe('"Acme HVAC" <billing@bellfield.app>');
  });

  it('uses the receipt sender and sends no attachment for receipt messages', async () => {
    process.env.BELLFIELD_RELAY_RECEIPT_FROM_ADDRESS = 'billing@bellfield.app';
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'prov-receipt-123' })
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const adapter = new ResendEmailAdapter();

    const result = await adapter.send({
      sender: 'receipt',
      fromName: 'Acme HVAC',
      to: 'homeowner@example.com',
      replyToEmail: 'office@acmehvac.example',
      subject: 'Your payment receipt',
      bodyText: 'We received your payment of $100.00.',
      idempotencyKey: 'relay/shop_1/receipt-pm-1'
    });

    expect(result).toEqual({ kind: 'sent', providerMessageId: 'prov-receipt-123' });
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(options.body)) as Record<string, unknown>;
    expect(body.from).toBe('"Acme HVAC" <billing@bellfield.app>');
    expect(body.attachments).toBeUndefined();
  });

  it('uses the legacy sender env as an estimate fallback only', async () => {
    process.env.BELLFIELD_RELAY_FROM_ADDRESS = 'legacy-estimates@bellfield.app';
    delete process.env.BELLFIELD_RELAY_ESTIMATE_FROM_ADDRESS;
    delete process.env.BELLFIELD_RELAY_INVOICE_FROM_ADDRESS;
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'prov-legacy-123' })
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const adapter = new ResendEmailAdapter();

    await adapter.send(makeInput());
    await adapter.send({
      ...makeInput(),
      sender: 'invoice',
      idempotencyKey: 'relay/shop_1/invoice-send-msg-legacy'
    });

    const firstBody = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as Record<
      string,
      unknown
    >;
    const secondBody = JSON.parse(String(fetchMock.mock.calls[1][1].body)) as Record<
      string,
      unknown
    >;
    expect(firstBody.from).toBe('"Acme HVAC" <legacy-estimates@bellfield.app>');
    expect(secondBody.from).toBe('"Acme HVAC" <billing@bellfield.app>');
  });

  it('maps provider 4xx to a non-retryable rejection', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ message: 'invalid recipient' })
    }) as unknown as typeof fetch;
    const adapter = new ResendEmailAdapter();

    const result = await adapter.send(makeInput());

    expect(result).toMatchObject({ kind: 'failed', code: 'deliveryRejected', retryable: false });
  });

  it('maps provider 5xx to a retryable unavailability', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ message: 'try later' })
    }) as unknown as typeof fetch;
    const adapter = new ResendEmailAdapter();

    const result = await adapter.send(makeInput());

    expect(result).toMatchObject({ kind: 'failed', code: 'deliveryUnavailable', retryable: true });
  });

  it('maps network failures to a retryable unavailability', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('socket hang up')) as unknown as typeof fetch;
    const adapter = new ResendEmailAdapter();

    const result = await adapter.send(makeInput());

    expect(result).toMatchObject({ kind: 'failed', code: 'deliveryUnavailable', retryable: true });
  });
});

describe('formatFrom', () => {
  it('quotes display names and keeps the address', () => {
    expect(formatFrom('Acme HVAC', 'estimates@bellfield.app')).toBe(
      '"Acme HVAC" <estimates@bellfield.app>'
    );
  });

  it('escapes quotes and backslashes', () => {
    expect(formatFrom('Acme "The Best" \\ HVAC', 'estimates@bellfield.app')).toBe(
      '"Acme \\"The Best\\" \\\\ HVAC" <estimates@bellfield.app>'
    );
  });

  it('strips control characters and falls back to the bare address', () => {
    expect(formatFrom('\u0000\u0001', 'estimates@bellfield.app')).toBe('estimates@bellfield.app');
  });
});
