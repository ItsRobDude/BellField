import type { WorkerRelayConfig } from '../../common/config/runtime-config';
import { workerLog } from '../../common/logger';
import type {
  AcceptanceDecision,
  AcceptancePayload,
  RelayDecisionsOutcome,
  RelayDeliveryClient,
  RelaySendOutcome,
  RelayStatusOutcome
} from './delivery-types';

const relayServerInstanceHeader = 'x-bellfield-server-instance';

/**
 * Worker-local relay client (apps are intentionally not cross-imported; the
 * API holds its own copy of this thin adapter). Wire shapes follow
 * packages/contracts relay-delivery.
 */
export class RelayClient implements RelayDeliveryClient {
  constructor(private readonly config: WorkerRelayConfig) {}

  async sendEstimateDocument(input: {
    idempotencyKey: string;
    recipientEmail: string;
    fromName: string;
    replyToEmail?: string;
    subject: string;
    bodyText: string;
    document: { filename: string; bytes: Buffer };
    acceptance?: AcceptancePayload;
  }): Promise<RelaySendOutcome> {
    let response: Response;
    try {
      response = await fetch(`${this.config.baseUrl}/v1/messages/estimate`, {
        method: 'POST',
        headers: this.headers({ 'Content-Type': 'application/json' }),
        signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({
          idempotencyKey: input.idempotencyKey,
          recipientEmail: input.recipientEmail,
          fromName: input.fromName,
          replyToEmail: input.replyToEmail,
          subject: input.subject,
          bodyText: input.bodyText,
          document: {
            filename: input.document.filename,
            contentType: 'application/pdf',
            bytesBase64: input.document.bytes.toString('base64')
          },
          acceptance: input.acceptance
        })
      });
    } catch (error) {
      workerLog('info', 'Relay send request failed; will retry.', {
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      return { kind: 'failed', code: 'deliveryUnavailable', retryable: true };
    }

    if (response.status === 401 || response.status === 403) {
      return { kind: 'failed', code: 'deliveryRejected', retryable: false };
    }

    const body = (await response.json().catch(() => ({}))) as {
      result?:
        | {
            kind: 'sent';
            relayMessageId?: string;
            acceptanceLinkId?: string;
            acceptanceUrl?: string;
          }
        | { kind: 'failed'; code?: string; retryable?: boolean };
    };
    if (!response.ok) {
      return {
        kind: 'failed',
        code: response.status >= 500 ? 'deliveryUnavailable' : 'deliveryRejected',
        retryable: response.status >= 500
      };
    }

    const result = body.result;
    if (result?.kind === 'sent') {
      return {
        kind: 'sent',
        relayMessageId: result.relayMessageId,
        acceptanceLinkId: result.acceptanceLinkId,
        acceptanceUrl: result.acceptanceUrl
      };
    }
    if (result?.kind === 'failed') {
      return {
        kind: 'failed',
        code: result.code ?? 'unknown',
        retryable: result.retryable === true
      };
    }
    return { kind: 'failed', code: 'unknown', retryable: false };
  }

  async getMessageStatus(relayMessageId: string): Promise<RelayStatusOutcome> {
    let response: Response;
    try {
      response = await fetch(
        `${this.config.baseUrl}/v1/messages/${encodeURIComponent(relayMessageId)}/status`,
        {
          headers: this.headers(),
          signal: AbortSignal.timeout(10_000)
        }
      );
    } catch {
      return { kind: 'unavailable' };
    }

    if (response.status === 404) {
      return { kind: 'notFound' };
    }
    if (!response.ok) {
      return { kind: 'unavailable' };
    }
    const body = (await response.json().catch(() => ({}))) as { state?: string };
    if (
      body.state === 'sent' ||
      body.state === 'delivered' ||
      body.state === 'bounced' ||
      body.state === 'complained' ||
      body.state === 'failed'
    ) {
      return { kind: 'status', state: body.state };
    }
    return { kind: 'unavailable' };
  }

  async getAcceptanceDecisions(): Promise<RelayDecisionsOutcome> {
    let response: Response;
    try {
      response = await fetch(`${this.config.baseUrl}/v1/acceptance-decisions`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(10_000)
      });
    } catch {
      return { kind: 'unavailable' };
    }
    if (!response.ok) {
      return { kind: 'unavailable' };
    }
    const body = (await response.json().catch(() => ({}))) as {
      decisions?: AcceptanceDecision[];
    };
    return { kind: 'decisions', decisions: Array.isArray(body.decisions) ? body.decisions : [] };
  }

  async acknowledgeAcceptanceDecision(acceptanceLinkId: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.config.baseUrl}/v1/acceptance-decisions/${encodeURIComponent(acceptanceLinkId)}/ack`,
        {
          method: 'POST',
          headers: this.headers(),
          signal: AbortSignal.timeout(10_000)
        }
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.token}`,
      [relayServerInstanceHeader]: this.config.serverInstanceId,
      ...extra
    };
  }
}
