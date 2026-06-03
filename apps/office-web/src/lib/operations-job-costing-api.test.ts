import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getOfficeJobCosting,
  postOfficeJobExpense,
  postOfficeJobLabor,
  reverseOfficeJobCostEvent
} from './operations-api';

function mockJsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status: 200
  });
}

describe('operations-api job costing helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads costing and posts labor/expense/reversal at the right endpoints', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockJsonResponse({ costing: { events: [] } }))
      .mockResolvedValueOnce(mockJsonResponse({ event: { id: 'evt-1' } }))
      .mockResolvedValueOnce(mockJsonResponse({ event: { id: 'evt-2' } }))
      .mockResolvedValueOnce(mockJsonResponse({ event: { id: 'rev-1' } }));
    vi.stubGlobal('fetch', fetchMock);

    const auth = { sessionToken: 'session-token', apiBaseUrl: 'http://api.test' };
    await getOfficeJobCosting({ ...auth, jobId: 'job-1' });
    await postOfficeJobLabor({
      ...auth,
      jobId: 'job-1',
      body: { description: 'Install', hours: 2, ratePerHour: 95 }
    });
    await postOfficeJobExpense({
      ...auth,
      jobId: 'job-1',
      body: { description: 'Permit', amount: 50 }
    });
    await reverseOfficeJobCostEvent({
      ...auth,
      jobId: 'job-1',
      eventId: 'evt-1',
      body: { reason: 'Wrong rate' }
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://api.test/operations/jobs/job-1/costing',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer session-token' })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://api.test/operations/jobs/job-1/labor',
      expect.objectContaining({ method: 'POST' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://api.test/operations/jobs/job-1/expenses',
      expect.objectContaining({ method: 'POST' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'http://api.test/operations/jobs/job-1/cost-events/evt-1/reverse',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
