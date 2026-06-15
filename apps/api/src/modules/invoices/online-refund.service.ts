import { Injectable, Logger } from '@nestjs/common';
import {
  relayServerInstanceHeader,
  type OnlineRefundResponse,
  type RelayCreateRefundResponse
} from '@bellfield/contracts';
import { getApiRuntimeConfig, type ApiRelayConfig } from '../../common/config/runtime-config';
import { IdentityAccessService } from '../identity-access/identity-access.service';
import { OnlineRefundsRepository } from './online-refunds.repository';
import type { RequestOnlineRefundBodyDto } from './online-refund.dto';

@Injectable()
export class OnlineRefundService {
  private readonly logger = new Logger(OnlineRefundService.name);

  constructor(
    private readonly identityAccessService: IdentityAccessService,
    private readonly onlineRefundsRepository: OnlineRefundsRepository
  ) {}

  /**
   * Request an online (Stripe-via-relay) refund of a provider-confirmed card
   * payment. Office-only, gated on payments:refund. The confirmed refund is
   * recorded by the worker from a Stripe refund event — this only opens a pending
   * request. The work is deliberately split so NO database lock is held across the
   * relay network call: a short transaction validates and creates/reuses the
   * pending request, the relay call runs outside any transaction, and a second
   * short update records the outcome.
   */
  async requestOnlineRefund(
    sessionToken: string,
    paymentId: string,
    request: RequestOnlineRefundBodyDto
  ): Promise<OnlineRefundResponse> {
    const actor = await this.identityAccessService.getAuthorizedEmployee(
      sessionToken,
      'payments:refund',
      ['office-web']
    );

    const relay = getApiRuntimeConfig().relay;
    if (!relay) {
      return {
        state: 'paymentsNotConfigured',
        message: 'Online refunds are not configured for this server.'
      };
    }

    // Phase 1 (short txn): validate + create-or-reuse the pending request. Its row
    // locks are released at commit; we never hold them across the relay call.
    const reason = request.reason?.trim() || undefined;
    const pending = await this.onlineRefundsRepository.createOrReusePending(paymentId, {
      amount: request.amount,
      reason,
      actor: { id: actor.id, displayName: actor.displayName }
    });

    // Phase 2 (no txn/lock): ask the relay to create the Stripe refund.
    const relayResult = (
      await this.requestRelayRefund(relay, {
        idempotencyKey: pending.idempotencyKey,
        providerSessionId: pending.providerSessionId,
        amountCents: Math.round(pending.amount * 100),
        reason
      })
    ).result;

    // Phase 3 (short txn): record the outcome on the pending request.
    if (relayResult.kind === 'requested') {
      await this.onlineRefundsRepository.markRelayAccepted({
        id: pending.id,
        relayRefundRequestId: relayResult.refundRequestId,
        providerRefundId: relayResult.providerRefundId
      });
      return {
        state: 'requested',
        refundRequestId: pending.id,
        amount: pending.amount,
        currency: pending.currency
      };
    }

    if (relayResult.retryable) {
      // Transient: leave the request 'requested' with the last error so a retry
      // re-submits with the SAME idempotency key (the relay and Stripe dedupe it),
      // and never double-refunds even if Stripe already accepted the first call.
      await this.onlineRefundsRepository.markRelayError({
        id: pending.id,
        lastError: relayResult.message
      });
      this.logger.warn(
        `Online refund ${pending.id} relay call failed (retryable, code=${relayResult.code}).`
      );
      return {
        state: 'providerError',
        message: 'The refund could not be submitted right now. Please try again.'
      };
    }

    // Terminal: the relay rejected the refund outright. Its failure copy is
    // office-safe (amount/eligibility wording, no provider internals).
    await this.onlineRefundsRepository.markFailed({
      id: pending.id,
      failureReason: relayResult.message
    });
    return { state: 'failed', message: relayResult.message };
  }

  private async requestRelayRefund(
    relay: ApiRelayConfig,
    payload: {
      idempotencyKey: string;
      providerSessionId: string;
      amountCents: number;
      reason?: string;
    }
  ): Promise<RelayCreateRefundResponse> {
    try {
      const response = await fetch(`${relay.baseUrl}/v1/payment-refunds`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${relay.token}`,
          [relayServerInstanceHeader]: relay.serverInstanceId,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(30_000),
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        return {
          result: {
            kind: 'failed',
            // 5xx is transient (retryable); a 4xx means the relay refused the
            // request and retrying as-is won't help.
            code: response.status >= 500 ? 'providerError' : 'paymentsDisabled',
            retryable: response.status >= 500,
            message: 'Online refunds are not available right now.'
          }
        };
      }
      return (await response.json()) as RelayCreateRefundResponse;
    } catch {
      // Network/timeout (the relay may or may not have created the refund). Treat
      // as transient so the request stays 'requested' and reconciles via the
      // worker (by the relay's request id, or by outstanding payment+amount).
      return {
        result: {
          kind: 'failed',
          code: 'providerError',
          retryable: true,
          message: 'Online refunds are not available right now.'
        }
      };
    }
  }
}
