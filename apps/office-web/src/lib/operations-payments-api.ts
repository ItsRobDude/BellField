import type {
  CreateOnlinePaymentLinkRequest,
  CreateDepositPaymentLinkRequest,
  JobPaymentsResponse,
  OnlinePaymentLinkResponse,
  OnlineRefundRequest,
  OnlineRefundResponse,
  PaymentRefundResponse,
  PaymentResponse,
  RecordPaymentRequest,
  RecordRefundRequest
} from '@bellfield/contracts';
import { requestJson } from './operations-api-base';

// Payment-ledger API client (payments, online links, voids, refunds). Split out
// of operations-api.ts to keep that barrel under the source-size guardrail;
// re-exported from operations-api so existing import sites are unchanged.

/** List a job's payments across its posted invoices (newest first). */
export async function listOfficeJobPayments(input: {
  jobId: string;
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<JobPaymentsResponse> {
  return requestJson<JobPaymentsResponse>(`/operations/jobs/${input.jobId}/invoice/payments`, {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken
  });
}

/** Record a payment against a posted invoice. */
export async function recordOfficePayment(
  input: RecordPaymentRequest & { invoiceId: string; sessionToken: string; apiBaseUrl?: string }
): Promise<PaymentResponse> {
  const { invoiceId, sessionToken, apiBaseUrl, ...payload } = input;

  return requestJson<PaymentResponse>(`/operations/invoices/${invoiceId}/payments`, {
    apiBaseUrl,
    sessionToken,
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/** Record a manual job-level deposit (cash/check/card taken directly). */
export async function recordOfficeJobDeposit(
  input: RecordPaymentRequest & { jobId: string; sessionToken: string; apiBaseUrl?: string }
): Promise<PaymentResponse> {
  const { jobId, sessionToken, apiBaseUrl, ...payload } = input;

  return requestJson<PaymentResponse>(`/operations/jobs/${jobId}/payments/deposit`, {
    apiBaseUrl,
    sessionToken,
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/** Create a Stripe-hosted payment link, defaulting to the full current amount due. */
export async function createOfficeOnlinePaymentLink(
  input: CreateOnlinePaymentLinkRequest & {
    invoiceId: string;
    sessionToken: string;
    apiBaseUrl?: string;
  }
): Promise<OnlinePaymentLinkResponse> {
  const { invoiceId, sessionToken, apiBaseUrl, ...payload } = input;

  return requestJson<OnlinePaymentLinkResponse>(
    `/operations/invoices/${invoiceId}/payments/online-link`,
    {
      apiBaseUrl,
      sessionToken,
      method: 'POST',
      body: JSON.stringify(payload)
    }
  );
}

/** Create a Stripe-hosted deposit link for job credit before invoicing. */
export async function createOfficeDepositPaymentLink(
  input: CreateDepositPaymentLinkRequest & {
    jobId: string;
    sessionToken: string;
    apiBaseUrl?: string;
  }
): Promise<OnlinePaymentLinkResponse> {
  const { jobId, sessionToken, apiBaseUrl, ...payload } = input;

  return requestJson<OnlinePaymentLinkResponse>(`/operations/jobs/${jobId}/payments/deposit-link`, {
    apiBaseUrl,
    sessionToken,
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/** Void a payment by id (the correction path; payments are never edited in place). */
export async function voidOfficePayment(input: {
  paymentId: string;
  reason?: string;
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<PaymentResponse> {
  const { paymentId, sessionToken, apiBaseUrl, reason } = input;

  return requestJson<PaymentResponse>(`/operations/payments/${paymentId}/void`, {
    apiBaseUrl,
    sessionToken,
    method: 'POST',
    body: JSON.stringify({ reason })
  });
}

/** Refund all or part of a payment by id (manual refunds; reverses allocations). */
export async function refundOfficePayment(
  input: RecordRefundRequest & { paymentId: string; sessionToken: string; apiBaseUrl?: string }
): Promise<PaymentRefundResponse> {
  const { paymentId, sessionToken, apiBaseUrl, ...payload } = input;

  return requestJson<PaymentRefundResponse>(`/operations/payments/${paymentId}/refund`, {
    apiBaseUrl,
    sessionToken,
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/**
 * Request an online (Stripe-via-relay) refund of a provider-confirmed card payment.
 * Opens a pending request; the confirmed refund lands later via the worker.
 */
export async function requestOfficeOnlineRefund(
  input: OnlineRefundRequest & { paymentId: string; sessionToken: string; apiBaseUrl?: string }
): Promise<OnlineRefundResponse> {
  const { paymentId, sessionToken, apiBaseUrl, ...payload } = input;

  return requestJson<OnlineRefundResponse>(`/operations/payments/${paymentId}/online-refund`, {
    apiBaseUrl,
    sessionToken,
    method: 'POST',
    body: JSON.stringify(payload)
  });
}
