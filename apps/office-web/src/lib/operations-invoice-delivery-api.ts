import type {
  CancelOutboundMessageResponse,
  InvoiceSendPreviewResponse,
  OutboundMessagesResponse,
  SendInvoiceRequest,
  SendInvoiceResponse
} from '@bellfield/contracts';
import { requestJson } from './operations-api-base';

export async function getOfficeInvoiceSendPreview(input: {
  invoiceId: string;
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<InvoiceSendPreviewResponse> {
  return requestJson<InvoiceSendPreviewResponse>(
    `/operations/invoices/${input.invoiceId}/send-preview`,
    {
      apiBaseUrl: input.apiBaseUrl,
      sessionToken: input.sessionToken
    }
  );
}

export async function sendOfficeInvoice(
  input: SendInvoiceRequest & { invoiceId: string; sessionToken: string; apiBaseUrl?: string }
): Promise<SendInvoiceResponse> {
  const { invoiceId, sessionToken, apiBaseUrl, ...payload } = input;

  return requestJson<SendInvoiceResponse>(`/operations/invoices/${invoiceId}/send`, {
    apiBaseUrl,
    sessionToken,
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function getOfficeInvoiceOutboundMessages(input: {
  invoiceId: string;
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<OutboundMessagesResponse> {
  return requestJson<OutboundMessagesResponse>(
    `/operations/invoices/${input.invoiceId}/outbound-messages`,
    {
      apiBaseUrl: input.apiBaseUrl,
      sessionToken: input.sessionToken
    }
  );
}

export async function cancelOfficeInvoiceOutboundMessage(input: {
  invoiceId: string;
  outboundMessageId: string;
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<CancelOutboundMessageResponse> {
  return requestJson<CancelOutboundMessageResponse>(
    `/operations/invoices/${input.invoiceId}/outbound-messages/${input.outboundMessageId}/cancel`,
    {
      apiBaseUrl: input.apiBaseUrl,
      sessionToken: input.sessionToken,
      method: 'POST'
    }
  );
}
