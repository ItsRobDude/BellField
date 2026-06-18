import { OnlinePaymentsSetupService } from './online-payments-setup.service';

const originalEnv = {
  baseUrl: process.env.BELLFIELD_RELAY_BASE_URL,
  token: process.env.BELLFIELD_RELAY_TOKEN,
  serverInstanceId: process.env.BELLFIELD_RELAY_SERVER_INSTANCE_ID
};

function restoreEnv() {
  if (originalEnv.baseUrl === undefined) {
    delete process.env.BELLFIELD_RELAY_BASE_URL;
  } else {
    process.env.BELLFIELD_RELAY_BASE_URL = originalEnv.baseUrl;
  }
  if (originalEnv.token === undefined) {
    delete process.env.BELLFIELD_RELAY_TOKEN;
  } else {
    process.env.BELLFIELD_RELAY_TOKEN = originalEnv.token;
  }
  if (originalEnv.serverInstanceId === undefined) {
    delete process.env.BELLFIELD_RELAY_SERVER_INSTANCE_ID;
  } else {
    process.env.BELLFIELD_RELAY_SERVER_INSTANCE_ID = originalEnv.serverInstanceId;
  }
}

function setupRelayEnv() {
  process.env.BELLFIELD_RELAY_BASE_URL = 'https://relay.example';
  process.env.BELLFIELD_RELAY_TOKEN = 'relay-token';
  process.env.BELLFIELD_RELAY_SERVER_INSTANCE_ID = 'instance-1';
}

function makeService() {
  const identityAccessService = {
    getAuthorizedEmployee: jest.fn().mockResolvedValue({ id: 'emp-1' })
  };
  return {
    service: new OnlinePaymentsSetupService(identityAccessService as never),
    identityAccessService
  };
}

describe('OnlinePaymentsSetupService', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    setupRelayEnv();
  });

  afterEach(() => {
    restoreEnv();
    jest.restoreAllMocks();
  });

  it('proxies setup status with relay auth headers', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ready', paymentsEnabledAt: '2026-06-18T12:00:00.000Z' })
    });
    global.fetch = fetchMock as never;
    const { service, identityAccessService } = makeService();

    const response = await service.getSetupStatus('session-token');

    expect(response.status).toBe('ready');
    expect(identityAccessService.getAuthorizedEmployee).toHaveBeenCalledWith(
      'session-token',
      'companySettings:view',
      ['office-web']
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://relay.example/v1/payments/setup-status',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer relay-token',
          'x-bellfield-server-instance': 'instance-1'
        })
      })
    );
  });

  it('proxies setup-link creation with configure permission', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'actionRequired',
        onboardingUrl: 'https://connect.stripe.test/setup'
      })
    });
    global.fetch = fetchMock as never;
    const { service, identityAccessService } = makeService();

    const response = await service.createSetupLink('session-token');

    expect(response.onboardingUrl).toBe('https://connect.stripe.test/setup');
    expect(identityAccessService.getAuthorizedEmployee).toHaveBeenCalledWith(
      'session-token',
      'companySettings:configure',
      ['office-web']
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://relay.example/v1/payments/setup-link',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('maps relay failures to owner-readable status', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 }) as never;
    const { service } = makeService();

    await expect(service.refreshSetupLink('session-token')).resolves.toEqual({
      status: 'providerError',
      message: 'Online payments setup is not available right now.'
    });
  });

  it('reports providerError when the install has no relay credentials', async () => {
    delete process.env.BELLFIELD_RELAY_BASE_URL;
    delete process.env.BELLFIELD_RELAY_TOKEN;
    delete process.env.BELLFIELD_RELAY_SERVER_INSTANCE_ID;
    const { service } = makeService();

    await expect(service.getSetupStatus('session-token')).resolves.toEqual({
      status: 'providerError',
      message: 'Online payments are not configured for this server.'
    });
  });
});
