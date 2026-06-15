import { OnlineRefundService } from './online-refund.service';
import type { PendingOnlineRefund } from './online-refunds.repository';

const actor = { id: 'emp-1', displayName: 'Bea Bookkeeper' };

function pending(overrides: Partial<PendingOnlineRefund> = {}): PendingOnlineRefund {
  return {
    id: 'orr-1',
    idempotencyKey: 'online-refund:pay-1:5000:attempt-1',
    providerSessionId: 'cs_1',
    amount: 50,
    currency: 'USD',
    reused: false,
    ...overrides
  };
}

function createService() {
  const identityAccessService = {
    getAuthorizedEmployee: jest.fn().mockResolvedValue(actor)
  };
  const onlineRefundsRepository = {
    createOrReusePending: jest.fn().mockResolvedValue(pending()),
    markRelayAccepted: jest.fn().mockResolvedValue(undefined),
    markRelayError: jest.fn().mockResolvedValue(undefined),
    markFailed: jest.fn().mockResolvedValue(undefined)
  };
  return {
    service: new OnlineRefundService(
      identityAccessService as never,
      onlineRefundsRepository as never
    ),
    identityAccessService,
    onlineRefundsRepository
  };
}

function setupRelayEnv() {
  process.env.BELLFIELD_RELAY_BASE_URL = 'https://relay.example';
  process.env.BELLFIELD_RELAY_TOKEN = 'relay-token';
  process.env.BELLFIELD_RELAY_SERVER_INSTANCE_ID = 'instance-1';
}

function clearRelayEnv() {
  delete process.env.BELLFIELD_RELAY_BASE_URL;
  delete process.env.BELLFIELD_RELAY_TOKEN;
  delete process.env.BELLFIELD_RELAY_SERVER_INSTANCE_ID;
}

function mockRelay(result: unknown, init: { ok?: boolean; status?: number } = {}) {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => ({ result })
  });
  global.fetch = fetchMock as never;
  return fetchMock;
}

function relayRequestBody(fetchMock: jest.Mock): {
  idempotencyKey: string;
  providerSessionId: string;
  amountCents: number;
} {
  const body = fetchMock.mock.calls[0]?.[1]?.body;
  if (typeof body !== 'string') {
    throw new Error('Expected relay request body.');
  }
  return JSON.parse(body);
}

describe('OnlineRefundService.requestOnlineRefund', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    clearRelayEnv();
    setupRelayEnv();
  });

  afterEach(() => {
    clearRelayEnv();
    jest.restoreAllMocks();
  });

  it('returns paymentsNotConfigured and opens nothing when no relay is configured', async () => {
    clearRelayEnv();
    const fetchMock = jest.fn();
    global.fetch = fetchMock as never;
    const { service, onlineRefundsRepository } = createService();

    const result = await service.requestOnlineRefund('token', 'pay-1', { amount: 50 });

    expect(result).toEqual({
      state: 'paymentsNotConfigured',
      message: 'Online refunds are not configured for this server.'
    });
    expect(onlineRefundsRepository.createOrReusePending).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requests the refund and records the relay ids on acceptance', async () => {
    const fetchMock = mockRelay({
      kind: 'requested',
      refundRequestId: 'rr-1',
      providerRefundId: 're_1',
      amountCents: 5000,
      currency: 'USD',
      providerStatus: 'pending'
    });
    const { service, onlineRefundsRepository } = createService();

    const result = await service.requestOnlineRefund('token', 'pay-1', {
      amount: 50,
      reason: 'duplicate charge'
    });

    expect(result).toEqual({
      state: 'requested',
      refundRequestId: 'orr-1',
      amount: 50,
      currency: 'USD'
    });
    expect(relayRequestBody(fetchMock)).toEqual({
      idempotencyKey: 'online-refund:pay-1:5000:attempt-1',
      providerSessionId: 'cs_1',
      amountCents: 5000,
      reason: 'duplicate charge'
    });
    expect(onlineRefundsRepository.markRelayAccepted).toHaveBeenCalledWith({
      id: 'orr-1',
      relayRefundRequestId: 'rr-1',
      providerRefundId: 're_1'
    });
    expect(onlineRefundsRepository.markFailed).not.toHaveBeenCalled();
  });

  it('keeps the request open (retryable) on a retryable relay failure', async () => {
    mockRelay({
      kind: 'failed',
      code: 'providerError',
      retryable: true,
      message: 'Stripe could not create the refund.'
    });
    const { service, onlineRefundsRepository } = createService();

    const result = await service.requestOnlineRefund('token', 'pay-1', { amount: 50 });

    expect(result.state).toBe('providerError');
    if (result.state === 'requested') {
      throw new Error('expected a non-requested result');
    }
    // Office copy never leaks the provider name.
    expect(result.message).toBe('The refund could not be submitted right now. Please try again.');
    expect(onlineRefundsRepository.markRelayError).toHaveBeenCalledWith({
      id: 'orr-1',
      lastError: 'Stripe could not create the refund.'
    });
    expect(onlineRefundsRepository.markFailed).not.toHaveBeenCalled();
  });

  it('marks the request failed on a terminal relay rejection', async () => {
    mockRelay({
      kind: 'failed',
      code: 'amountExceedsRefundable',
      retryable: false,
      message: 'Refund exceeds the amount still refundable on this payment.'
    });
    const { service, onlineRefundsRepository } = createService();

    const result = await service.requestOnlineRefund('token', 'pay-1', { amount: 50 });

    expect(result).toEqual({
      state: 'failed',
      message: 'Refund exceeds the amount still refundable on this payment.'
    });
    expect(onlineRefundsRepository.markFailed).toHaveBeenCalledWith({
      id: 'orr-1',
      failureReason: 'Refund exceeds the amount still refundable on this payment.'
    });
    expect(onlineRefundsRepository.markRelayError).not.toHaveBeenCalled();
  });

  it('treats a transport error as retryable so the request stays open', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error('socket hang up'));
    global.fetch = fetchMock as never;
    const { service, onlineRefundsRepository } = createService();

    const result = await service.requestOnlineRefund('token', 'pay-1', { amount: 50 });

    expect(result.state).toBe('providerError');
    expect(onlineRefundsRepository.markRelayError).toHaveBeenCalled();
    expect(onlineRefundsRepository.markFailed).not.toHaveBeenCalled();
  });

  it('treats a relay 5xx as retryable and a 4xx as terminal', async () => {
    mockRelay({}, { ok: false, status: 503 });
    const fivexx = createService();
    const result5xx = await fivexx.service.requestOnlineRefund('token', 'pay-1', { amount: 50 });
    expect(result5xx.state).toBe('providerError');
    expect(fivexx.onlineRefundsRepository.markRelayError).toHaveBeenCalled();

    mockRelay({}, { ok: false, status: 400 });
    const fourxx = createService();
    const result4xx = await fourxx.service.requestOnlineRefund('token', 'pay-1', { amount: 50 });
    expect(result4xx.state).toBe('failed');
    expect(fourxx.onlineRefundsRepository.markFailed).toHaveBeenCalled();
  });
});
