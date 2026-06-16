import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import {
  relayServerInstanceHeader,
  type OnlinePaymentLinkResponse,
  type RelayCreatePaymentSessionResponse
} from '@bellfield/contracts';
import { getApiRuntimeConfig, type ApiRelayConfig } from '../../common/config/runtime-config';
import { JobsDataService } from '../company-data/jobs-data.service';
import { IdentityAccessService } from '../identity-access/identity-access.service';
import { InvoicesRepository } from './invoices.repository';
import { PaymentsRepository } from './payments.repository';
import { OnlinePaymentsRepository } from './online-payments.repository';
import type {
  CreateDepositPaymentLinkRequestBodyDto,
  CreateOnlinePaymentLinkRequestBodyDto
} from './online-payment-link.dto';

@Injectable()
export class OnlinePaymentLinkService {
  constructor(
    private readonly identityAccessService: IdentityAccessService,
    private readonly jobsDataService: JobsDataService,
    private readonly invoicesRepository: InvoicesRepository,
    private readonly paymentsRepository: PaymentsRepository,
    private readonly onlinePaymentsRepository: OnlinePaymentsRepository
  ) {}

  async createOnlinePaymentLink(
    sessionToken: string,
    invoiceId: string,
    request: CreateOnlinePaymentLinkRequestBodyDto
  ): Promise<OnlinePaymentLinkResponse> {
    const actor = await this.requireCreatePaymentActor(sessionToken);
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

    const requestedAmountCents =
      request.amount === undefined ? amountDueCents : dollarsToCents(request.amount);
    if (!isValidDollarAmountCents(request.amount, requestedAmountCents)) {
      throw new BadRequestException('Payment link amount must be a positive dollar amount.');
    }
    if (requestedAmountCents > amountDueCents) {
      throw new ConflictException(
        `Payment link amount cannot exceed the ${formatMoney(amountDueCents / 100)} currently due.`
      );
    }

    return this.createRelayPaymentSession({
      actor,
      jobId: invoice.jobId,
      invoiceId: invoice.id,
      requestedAmountCents,
      currency: 'USD',
      request,
      idempotencyPrefix: 'invoice-payment',
      idempotencySource: invoice.id,
      description: `BellField invoice ${invoice.posted?.jobNumber ?? invoice.id}`,
      timelinePurpose: 'payment',
      amountDueCents,
      confirmActiveLinkOverage: request.confirmActiveLinkOverage === true,
      sameAmountMessage: (amount) =>
        `This job already had an online card payment for ${formatMoney(
          amount
        )}. BellField still shows ${formatMoney(amountDueCents / 100)} due.`
    });
  }

  async createDepositPaymentLink(
    sessionToken: string,
    jobId: string,
    request: CreateDepositPaymentLinkRequestBodyDto
  ): Promise<OnlinePaymentLinkResponse> {
    const actor = await this.requireCreatePaymentActor(sessionToken);
    const job = await this.jobsDataService.getJobById(jobId);
    const requestedAmountCents = dollarsToCents(request.amount);
    if (!isValidDollarAmountCents(request.amount, requestedAmountCents)) {
      throw new BadRequestException('Deposit link amount must be a positive dollar amount.');
    }

    return this.createRelayPaymentSession({
      actor,
      jobId,
      invoiceId: null,
      requestedAmountCents,
      currency: 'USD',
      request,
      idempotencyPrefix: 'deposit-payment',
      idempotencySource: 'deposit',
      description: `BellField deposit for job ${job.jobNumber ?? job.id}`,
      timelinePurpose: 'deposit',
      sameAmountMessage: (amount) =>
        `This job already had an online card deposit for ${formatMoney(amount)}.`
    });
  }

  private async requireCreatePaymentActor(sessionToken: string) {
    return this.identityAccessService.getAuthorizedEmployee(sessionToken, 'payments:create', [
      'office-web'
    ]);
  }

  private async createRelayPaymentSession(input: {
    actor: { id: string; displayName: string };
    jobId: string;
    invoiceId: string | null;
    requestedAmountCents: number;
    currency: string;
    request: {
      customerEmail?: string;
      confirmSameAmountCharge?: boolean;
    };
    idempotencyPrefix: 'invoice-payment' | 'deposit-payment';
    idempotencySource: string;
    description: string;
    timelinePurpose: 'payment' | 'deposit';
    amountDueCents?: number;
    confirmActiveLinkOverage?: boolean;
    sameAmountMessage: (amount: number) => string;
  }): Promise<OnlinePaymentLinkResponse> {
    const amount = input.requestedAmountCents / 100;
    const sameAmountSessions = await this.onlinePaymentsRepository.listForJobAmount({
      jobId: input.jobId,
      invoiceId: input.invoiceId,
      amount,
      currency: input.currency
    });
    const now = new Date();
    const activeSession = sameAmountSessions.find((session) => isActiveSession(session, now));
    if (activeSession) {
      return {
        state: 'created',
        checkoutUrl: activeSession.checkoutUrl,
        paymentSessionId: activeSession.relayPaymentSessionId,
        amount,
        currency: input.currency,
        expiresAt: activeSession.expiresAt,
        reusedExisting: true
      };
    }

    const hasPaidSameAmountSession = sameAmountSessions.some(
      (session) => session.status === 'paid'
    );
    if (hasPaidSameAmountSession && input.request.confirmSameAmountCharge !== true) {
      return {
        state: 'confirmationRequired',
        code: 'sameAmountPreviouslyPaid',
        amount,
        currency: input.currency,
        message: input.sameAmountMessage(amount)
      };
    }

    if (input.amountDueCents !== undefined && !input.confirmActiveLinkOverage) {
      const activeUnpaidCents =
        await this.onlinePaymentsRepository.sumActiveCreatedSessionCentsForJob({
          jobId: input.jobId,
          currency: input.currency,
          now
        });
      if (activeUnpaidCents + input.requestedAmountCents > input.amountDueCents) {
        return {
          state: 'confirmationRequired',
          code: 'activeLinksMayExceedDue',
          amount,
          currency: input.currency,
          message: `This job already has ${formatMoney(
            activeUnpaidCents / 100
          )} in active unpaid online payment links. Creating another ${formatMoney(
            amount
          )} link could let the customer pay more than the ${formatMoney(
            input.amountDueCents / 100
          )} currently due. Any overpayment will be held as job credit.`
        };
      }
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
    const idempotencyKey = `${input.idempotencyPrefix}:${input.jobId}:${input.idempotencySource}:${
      input.requestedAmountCents
    }:attempt-${sameAmountSessions.length + 1}`;
    const relayResponse = await this.requestRelayPaymentSession(relay, {
      idempotencyKey,
      jobRef: input.jobId,
      invoiceRef: input.invoiceId ?? undefined,
      amountCents: input.requestedAmountCents,
      currency: input.currency,
      description: input.description,
      customerEmail: input.request.customerEmail?.trim() || undefined
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
      jobId: input.jobId,
      invoiceId: input.invoiceId,
      relayPaymentSessionId: result.paymentSessionId,
      amount,
      currency: input.currency,
      checkoutUrl: result.checkoutUrl,
      createdByEmployeeId: input.actor.id,
      createdByName: input.actor.displayName,
      expiresAt: result.expiresAt,
      purpose: input.timelinePurpose
    });

    return {
      state: 'created',
      checkoutUrl: result.checkoutUrl,
      paymentSessionId: result.paymentSessionId,
      amount,
      currency: input.currency,
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
      invoiceRef?: string;
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

function isValidDollarAmountCents(value: number | undefined, cents: number): boolean {
  if (value === undefined) {
    return cents > 0;
  }
  return Number.isFinite(value) && value > 0 && Math.abs(value * 100 - cents) < 0.000001;
}

function isActiveSession(session: { status: string; expiresAt: string }, now: Date): boolean {
  return session.status === 'created' && new Date(session.expiresAt).getTime() > now.getTime();
}

function formatMoney(amount: number): string {
  return `$${amount.toFixed(2)}`;
}
