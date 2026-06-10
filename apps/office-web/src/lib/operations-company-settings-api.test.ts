import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getOfficeEstimateEmailDeliveryStatus,
  getOfficeCompanySettings,
  updateOfficeCompanySettings
} from './operations-company-settings-api';

function mockJsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status: 200
  });
}

describe('operations-company-settings-api', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls the company settings endpoints with office auth', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockJsonResponse({ settings: {} }))
      .mockResolvedValueOnce(mockJsonResponse({ settings: {} }))
      .mockResolvedValueOnce(mockJsonResponse({ deliveryStatus: {} }));
    vi.stubGlobal('fetch', fetchMock);

    await getOfficeCompanySettings({
      sessionToken: 'session-token',
      apiBaseUrl: 'http://api.test'
    });
    await updateOfficeCompanySettings({
      sessionToken: 'session-token',
      apiBaseUrl: 'http://api.test',
      companyName: 'BellField',
      estimateEmailSubject: 'Estimate from BellField',
      estimateEmailBody: 'Attached.',
      chargesSalesTax: true,
      defaultSalesTaxBasisPoints: 825
    });
    await getOfficeEstimateEmailDeliveryStatus({
      sessionToken: 'session-token',
      apiBaseUrl: 'http://api.test'
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://api.test/operations/company-settings',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer session-token' })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://api.test/operations/company-settings',
      expect.objectContaining({ method: 'PUT' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://api.test/operations/company-settings/delivery-status',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer session-token' })
      })
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
