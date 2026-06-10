import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  downloadOfficeEstimatePdf,
  getOfficeMediaAttachments,
  getOfficeMediaBlob,
  getOfficeRegisterEntries,
  getOfficeEstimateOutboundMessages,
  getOfficeEstimateSendPreview,
  sendOfficeEstimate,
  updateOfficeMediaAttachment,
  updateOfficeRegisterEntry,
  voidOfficeMediaAttachment,
  voidOfficeRegisterEntry
} from './operations-api';

function mockJsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status: 200
  });
}

describe('operations-api captured work helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls the existing register and media review endpoints with office auth', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockJsonResponse({ registerEntries: [] }))
      .mockResolvedValueOnce(mockJsonResponse({ mediaAttachments: [] }))
      .mockResolvedValueOnce(mockJsonResponse({ syncResult: { status: 'applied' } }))
      .mockResolvedValueOnce(mockJsonResponse({ syncResult: { status: 'applied' } }))
      .mockResolvedValueOnce(mockJsonResponse({ mediaAttachment: { id: 'media-1' } }))
      .mockResolvedValueOnce(mockJsonResponse({ mediaAttachment: { id: 'media-1' } }));
    vi.stubGlobal('fetch', fetchMock);

    await getOfficeRegisterEntries({
      jobId: 'job-1',
      sessionToken: 'session-token',
      apiBaseUrl: 'http://api.test'
    });
    await getOfficeMediaAttachments({
      jobId: 'job-1',
      sessionToken: 'session-token',
      apiBaseUrl: 'http://api.test'
    });
    await updateOfficeRegisterEntry({
      registerEntryId: 'register-1',
      sessionToken: 'session-token',
      apiBaseUrl: 'http://api.test',
      description: 'Diagnostic',
      kind: 'serviceItem',
      quantity: 1,
      totalAmount: 95
    });
    await voidOfficeRegisterEntry({
      registerEntryId: 'register-1',
      sessionToken: 'session-token',
      apiBaseUrl: 'http://api.test',
      reason: 'duplicate'
    });
    await updateOfficeMediaAttachment({
      mediaId: 'media-1',
      sessionToken: 'session-token',
      apiBaseUrl: 'http://api.test',
      caption: 'Before cleaning'
    });
    await voidOfficeMediaAttachment({
      mediaId: 'media-1',
      sessionToken: 'session-token',
      apiBaseUrl: 'http://api.test',
      reason: 'wrong file'
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://api.test/operations/jobs/job-1/register-entries',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer session-token' })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://api.test/operations/jobs/job-1/media',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer session-token' })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://api.test/operations/jobs/register-entries/register-1',
      expect.objectContaining({ method: 'PATCH' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'http://api.test/operations/jobs/register-entries/register-1/void',
      expect.objectContaining({ method: 'POST' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      'http://api.test/operations/media/media-1',
      expect.objectContaining({ method: 'PATCH' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      'http://api.test/operations/media/media-1/void',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('calls the estimate delivery endpoints with office auth', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockJsonResponse({ outboundMessage: {}, documentSnapshot: {} }))
      .mockResolvedValueOnce(mockJsonResponse({ outboundMessages: [] }))
      .mockResolvedValueOnce(mockJsonResponse({ preview: {}, deliveryStatus: {} }));
    vi.stubGlobal('fetch', fetchMock);

    await sendOfficeEstimate({
      estimateId: 'estimate-1',
      sessionToken: 'session-token',
      apiBaseUrl: 'http://api.test',
      recipientEmail: 'customer@example.com'
    });
    await getOfficeEstimateOutboundMessages({
      estimateId: 'estimate-1',
      sessionToken: 'session-token',
      apiBaseUrl: 'http://api.test'
    });
    await getOfficeEstimateSendPreview({
      estimateId: 'estimate-1',
      sessionToken: 'session-token',
      apiBaseUrl: 'http://api.test'
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://api.test/operations/estimates/estimate-1/send',
      expect.objectContaining({ method: 'POST' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://api.test/operations/estimates/estimate-1/outbound-messages',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer session-token' })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://api.test/operations/estimates/estimate-1/send-preview',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer session-token' })
      })
    );
  });

  it('downloads estimate PDFs from the PDF document endpoint', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(new Blob(['pdf-bytes']), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await downloadOfficeEstimatePdf({
      estimateId: 'estimate-1',
      sessionToken: 'session-token',
      apiBaseUrl: 'http://api.test'
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/operations/estimates/estimate-1/pdf',
      expect.objectContaining({
        headers: { Authorization: 'Bearer session-token' }
      })
    );
  });

  it('downloads media blobs without forcing a JSON content type', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(new Blob(['media-bytes']), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await getOfficeMediaBlob({
      mediaId: 'media-1',
      sessionToken: 'session-token',
      apiBaseUrl: 'http://api.test'
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/operations/media/media-1/blob',
      expect.objectContaining({
        headers: { Authorization: 'Bearer session-token' }
      })
    );
  });
});
