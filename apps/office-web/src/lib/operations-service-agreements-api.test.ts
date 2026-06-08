import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  activateOfficeServiceAgreement,
  createOfficeServiceAgreement,
  endOfficeServiceAgreement,
  getOfficeServiceAgreement,
  listOfficeServiceAgreements,
  pauseOfficeServiceAgreement,
  updateOfficeServiceAgreement
} from './operations-api';

function mockJsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status: 200
  });
}

describe('operations-api service agreement helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls service agreement read endpoints with filters and office auth', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockJsonResponse({ agreements: [] }))
      .mockResolvedValueOnce(mockJsonResponse({ agreement: { id: 'agreement-1' } }));
    vi.stubGlobal('fetch', fetchMock);

    await listOfficeServiceAgreements({
      sessionToken: 'session-token',
      apiBaseUrl: 'http://api.test',
      customerId: 'customer-1',
      locationId: 'location-1',
      status: 'active'
    });
    await getOfficeServiceAgreement({
      sessionToken: 'session-token',
      apiBaseUrl: 'http://api.test',
      agreementId: 'agreement-1'
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://api.test/operations/service-agreements?customerId=customer-1&locationId=location-1&status=active',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer session-token' })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://api.test/operations/service-agreements/agreement-1',
      expect.anything()
    );
  });

  it('calls service agreement write and lifecycle endpoints', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        mockJsonResponse({
          agreement: { id: 'agreement-1' }
        })
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const auth = { sessionToken: 'session-token', apiBaseUrl: 'http://api.test' };
    await createOfficeServiceAgreement({
      ...auth,
      body: {
        customerId: 'customer-1',
        name: 'Annual plan',
        coveredLocationIds: ['location-1']
      }
    });
    await updateOfficeServiceAgreement({
      ...auth,
      agreementId: 'agreement-1',
      body: { name: 'Annual plan', coveredLocationIds: ['location-1'] }
    });
    await activateOfficeServiceAgreement({ ...auth, agreementId: 'agreement-1' });
    await pauseOfficeServiceAgreement({ ...auth, agreementId: 'agreement-1' });
    await endOfficeServiceAgreement({
      ...auth,
      agreementId: 'agreement-1',
      body: { reason: 'Customer cancelled.' }
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://api.test/operations/service-agreements',
      expect.objectContaining({ method: 'POST' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://api.test/operations/service-agreements/agreement-1',
      expect.objectContaining({ method: 'PUT' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://api.test/operations/service-agreements/agreement-1/activate',
      expect.objectContaining({ method: 'POST' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'http://api.test/operations/service-agreements/agreement-1/pause',
      expect.objectContaining({ method: 'POST' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      'http://api.test/operations/service-agreements/agreement-1/end',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
