import { bellfieldEstimateEmailFromAddress, EmailProviderService } from './email-provider.service';

const originalResendKey = process.env.BELLFIELD_ESTIMATE_EMAIL_RESEND_API_KEY;

describe('EmailProviderService', () => {
  afterEach(() => {
    if (originalResendKey === undefined) {
      delete process.env.BELLFIELD_ESTIMATE_EMAIL_RESEND_API_KEY;
    } else {
      process.env.BELLFIELD_ESTIMATE_EMAIL_RESEND_API_KEY = originalResendKey;
    }
    jest.restoreAllMocks();
  });

  it('does not send when the server-owned BellField key is missing', async () => {
    delete process.env.BELLFIELD_ESTIMATE_EMAIL_RESEND_API_KEY;
    const service = new EmailProviderService();

    await expect(service.sendEstimateEmail(sendInput())).resolves.toEqual({
      kind: 'notConfigured',
      message: 'BellField estimate email delivery is not configured.'
    });
  });

  it('always sends from the BellField estimate address and passes shop reply-to only', async () => {
    process.env.BELLFIELD_ESTIMATE_EMAIL_RESEND_API_KEY = 'server-owned-key';
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'resend-message-1' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      })
    );
    const service = new EmailProviderService();

    await expect(
      service.sendEstimateEmail(sendInput({ replyToEmail: 'office@example.com' }))
    ).resolves.toEqual({
      kind: 'sent',
      providerMessageId: 'resend-message-1'
    });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body)) as {
      from: string;
      reply_to?: string[];
      attachments: Array<{ content: string }>;
    };
    expect(request.headers).toEqual(
      expect.objectContaining({ Authorization: 'Bearer server-owned-key' })
    );
    expect(body.from).toBe(`BellField Estimates <${bellfieldEstimateEmailFromAddress}>`);
    expect(body.reply_to).toEqual(['office@example.com']);
    expect(body.attachments[0]?.content).toBe(Buffer.from('%PDF test').toString('base64'));
  });

  it('returns a user-safe failure instead of provider internals', async () => {
    process.env.BELLFIELD_ESTIMATE_EMAIL_RESEND_API_KEY = 'server-owned-key';
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'The bellfield.app domain is not verified.' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 403
      })
    );
    const service = new EmailProviderService();

    await expect(service.sendEstimateEmail(sendInput())).resolves.toEqual({
      kind: 'error',
      message: 'BellField estimate email delivery failed. Try again or contact support.'
    });
  });

  it('reports estimate delivery as needing setup when the server-owned key is missing', async () => {
    delete process.env.BELLFIELD_ESTIMATE_EMAIL_RESEND_API_KEY;
    const service = new EmailProviderService();

    await expect(service.getEstimateEmailDeliveryStatus()).resolves.toEqual({
      configured: false,
      ready: false,
      status: 'needsSetup',
      message: 'Estimate email is not available on this server. Contact BellField support.'
    });
  });

  it('reports estimate delivery as ready when the sending domain is verified', async () => {
    process.env.BELLFIELD_ESTIMATE_EMAIL_RESEND_API_KEY = 'server-owned-key';
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              name: 'bellfield.app',
              status: 'verified',
              capabilities: { sending: 'enabled' }
            }
          ]
        }),
        {
          headers: { 'Content-Type': 'application/json' },
          status: 200
        }
      )
    );
    const service = new EmailProviderService();

    await expect(service.getEstimateEmailDeliveryStatus()).resolves.toEqual({
      configured: true,
      ready: true,
      status: 'ready',
      message: 'Estimate email is ready.'
    });
  });

  it('reports estimate delivery as needing setup when the sending domain is not verified', async () => {
    process.env.BELLFIELD_ESTIMATE_EMAIL_RESEND_API_KEY = 'server-owned-key';
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [{ name: 'bellfield.app', status: 'not_started' }] }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      })
    );
    const service = new EmailProviderService();

    await expect(service.getEstimateEmailDeliveryStatus()).resolves.toEqual({
      configured: true,
      ready: false,
      status: 'needsSetup',
      message: 'Estimate email is not available on this server. Contact BellField support.'
    });
  });
});

function sendInput(
  overrides: Partial<Parameters<EmailProviderService['sendEstimateEmail']>[0]> = {}
) {
  return {
    to: 'customer@example.com',
    subject: 'Estimate from BellField',
    bodyText: 'Attached is your estimate.',
    attachment: {
      filename: 'estimate.pdf',
      contentType: 'application/pdf' as const,
      bytes: Buffer.from('%PDF test')
    },
    idempotencyKey: 'estimate-send-1',
    ...overrides
  };
}
