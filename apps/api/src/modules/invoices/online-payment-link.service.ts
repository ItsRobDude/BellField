import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  relayServerInstanceHeader,
  type OnlinePaymentLinkResponse,
  type RelayCreatePaymentSessionResponse
} from '@bellfield/contracts';
import { getApiRuntimeConfig, type ApiRelayConfig } from '../../common/config/runtime-config';
import { IdentityAccessService } from '../identity-access/identity-access.service';
import { InvoicesRepository } from './invoices.repository';
import { PaymentsRepository } from './payments.repository';
import { OnlinePaymentsRepository } from './online-payments.repository';
import type { CreateOnlinePaymentLinkRequestBodyDto } from './online-payment-link.dto';

@Injectable()
export class OnlinePaymentLinkService {
  constructor(
    private readonly identityAccessService: IdentityAccessService,
    private readonly invoicesRepository: InvoicesRepository,
    private readonly paymentsRepository: PaymentsRepository,
    private readonly onlinePaymentsRepository: OnlinePaymentsRepository
  ) {}

  async createOnlinePaymentLink(
    sessionToken: string,
    invoiceId: string,
    request: CreateOnlinePaymentLinkRequestBodyDto
  ): Promise<OnlinePaymentLinkResponse> {
    const actor = await this.identityAccessService.getAuthorizedEmployee(
      sessionToken,
      'payments:create',
      ['office-web']
    );
    const invoice = await this.invoicesRepository.getInvoiceById(invoiceId);
    if (!invoice) {
      throw new NotFoundException('Invoice not found.');
    }
    if (invoice.status !== 'posted') {
      throw new ConflictException('Online payment links can only be created for posted invoices.');
    }
    if (invoice.invoiceKind === 'credit') {
      throw new ConflictException('A credit cannot be paid; it reduces what is owed.');
    }

    const amountDueCents = await this.getJobAmountDueCents(invoice.jobId);
    if (amountDueCents <= 0) {
      throw new ConflictException('This job does not have an outstanding balance.');
    }

    const currency = 'USD';
    const amount = amountDueCents / 100;
    const sameAmountSessions = await this.onlinePaymentsRepository.listForJobAmount({
      jobId: invoice.jobId,
      amount,
      currency
    });
    const now = new Date();
    const activeSession = sameAmountSessions.find((session) => isActiveSession(session, now));
    if (activeSession) {
      return {
        state: 'created',
        checkoutUrl: activeSession.checkoutUrl,
        paymentSessionId: activeSession.relayPaymentSessionId,
        amount,
        currency,
        expiresAt: activeSession.expiresAt,
        reusedExisting: true
      };
    }

    const hasPaidSameAmountSession = sameAmountSessions.some(
      (session) => session.status === 'paid'
    );
    if (hasPaidSameAmountSession && request.confirmSameAmountCharge !== true) {
      return {
        state: 'confirmationRequired',
        code: 'sameAmountPreviouslyPaid',
        amount,
        currency,
        message: `This job already had an online card payment for ${formatMoney(amount)}. BellField still shows ${formatMoney(amount)} due.`
      };
    }

    const relay = getApiRuntimeConfig().relay;
    if (!relay) {
      return {
        state: 'paymentsNotConfigured',
        message: 'Online payment links are not configured for this server.'
      };
    }

    // The attempt suffix keeps one live payable link per local balance while
    // still allowing a legitimate same-dollar charge after an earlier session
    // is paid or expired. The relay and Stripe both treat the full key as
    // opaque idempotency.
    const idempotencyKey = `invoice-payment:${invoice.jobId}:${amountDueCents}:attempt-${sameAmountSessions.length + 1}`;
    const relayResponse = await this.requestRelayPaymentSession(relay, {
      idempotencyKey,
      jobRef: invoice.jobId,
      invoiceRef: invoice.id,
      amountCents: amountDueCents,
      currency,
      description: `BellField invoice ${invoice.posted?.jobNumber ?? invoice.id}`,
      customerEmail: request.customerEmail?.trim() || undefined
    });

    const result = relayResponse.result;
    if (result.kind === 'failed') {
      return {
        state:
          result.code === 'paymentsNotConfigured'
            ? 'paymentsNotConfigured'
            : result.code === 'paymentsDisabled'
              ? 'paymentsDisabled'
              : 'providerError',
        message: result.message
      };
    }

    await this.onlinePaymentsRepository.recordCreated({
      jobId: invoice.jobId,
      invoiceId: invoice.id,
      relayPaymentSessionId: result.paymentSessionId,
      amount,
      currency,
      checkoutUrl: result.checkoutUrl,
      createdByEmployeeId: actor.id,
      createdByName: actor.displayName,
      expiresAt: result.expiresAt
    });

    return {
      state: 'created',
      checkoutUrl: result.checkoutUrl,
      paymentSessionId: result.paymentSessionId,
      amount,
      currency,
      expiresAt: result.expiresAt
    };
  }

  private async getJobAmountDueCents(jobId: string): Promise<number> {
    const invoices = await this.invoicesRepository.listInvoiceTotalsForJob(jobId);
    const postedMainCents = invoices
      .filter((invoice) => invoice.invoiceKind === 'main' && invoice.status === 'posted')
      .reduce((sum, invoice) => sum + dollarsToCents(invoice.total), 0);
    const postedAdjustmentCents = invoices
      .filter((invoice) => invoice.invoiceKind === 'adjustment' && invoice.status === 'posted')
      .reduce((sum, invoice) => sum + dollarsToCents(invoice.total), 0);
    const postedCreditCents = invoices
      .filter((invoice) => invoice.invoiceKind === 'credit' && invoice.status === 'posted')
      .reduce((sum, invoice) => sum + dollarsToCents(invoice.total), 0);
    const paidCents = await this.paymentsRepository.sumActivePaymentCentsForJob(jobId);
    const refundedCents = await this.paymentsRepository.sumActiveRefundCentsForJob(jobId);
    return postedMainCents + postedAdjustmentCents - postedCreditCents - paidCents + refundedCents;
  }

  private async requestRelayPaymentSession(
    relay: ApiRelayConfig,
    payload: {
      idempotencyKey: string;
      jobRef: string;
      invoiceRef: string;
      amountCents: number;
      currency: string;
      description: string;
      customerEmail?: string;
    }
  ): Promise<RelayCreatePaymentSessionResponse> {
    const response = await fetch(`${relay.baseUrl}/v1/payment-sessions`, {
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
          code: response.status >= 500 ? 'providerError' : 'paymentsDisabled',
          retryable: response.status >= 500,
          message: 'Online payment links are not available right now.'
        }
      };
    }
    return (await response.json()) as RelayCreatePaymentSessionResponse;
  }
}

function dollarsToCents(value: number): number {
  return Math.round(value * 100);
}

function isActiveSession(session: { status: string; expiresAt: string }, now: Date): boolean {
  return session.status === 'created' && new Date(session.expiresAt).getTime() > now.getTime();
}

function formatMoney(amount: number): string {
  return `$${amount.toFixed(2)}`;
}
