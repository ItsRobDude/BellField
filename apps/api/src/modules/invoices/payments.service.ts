import { Injectable } from '@nestjs/common';
import { IdentityAccessService } from '../identity-access/identity-access.service';
import { JobsDataService } from '../company-data/jobs-data.service';
import { PaymentsRepository } from './payments.repository';
import {
  OnlineRefundsRepository,
  type OnlineRefundRequestListItem
} from './online-refunds.repository';
import type {
  JobPaymentsResponseDto,
  OnlineRefundRequestSummaryDto,
  PaymentRecord,
  PaymentRefundResponseDto,
  PaymentRefundSummaryDto,
  PaymentResponseDto,
  PaymentSummaryDto,
  RecordPaymentRequestDto,
  RecordRefundRequestDto,
  RefundRecord,
  VoidPaymentRequestDto
} from './payments.types';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly identityAccessService: IdentityAccessService,
    private readonly jobsDataService: JobsDataService,
    private readonly paymentsRepository: PaymentsRepository,
    private readonly onlineRefundsRepository: OnlineRefundsRepository
  ) {}

  /**
   * Record a payment against a posted invoice. Office-only, gated on payments:create.
   * The amount/method are validated by the DTO; receivedAt defaults to now. The
   * repository locks the invoice and re-checks it is posted before inserting.
   */
  async recordPayment(
    sessionToken: string,
    invoiceId: string,
    request: RecordPaymentRequestDto
  ): Promise<PaymentResponseDto> {
    const actor = await this.identityAccessService.getAuthorizedEmployee(
      sessionToken,
      'payments:create',
      ['office-web']
    );

    const created = await this.paymentsRepository.recordPayment(invoiceId, {
      amount: request.amount,
      method: request.method,
      receivedAt: request.receivedAt ?? new Date().toISOString(),
      reference: request.reference?.trim() || undefined,
      memo: request.memo?.trim() || undefined,
      actor: { id: actor.id, displayName: actor.displayName }
    });
    return { payment: this.toSummary(created) };
  }

  /**
   * Record a manual job-level deposit (cash/check/card taken directly). Office-only,
   * gated on payments:create. Not scoped to an invoice — it lands as job credit
   * until posted charges exist; `purpose = 'deposit'` is the durable label.
   */
  async recordDeposit(
    sessionToken: string,
    jobId: string,
    request: RecordPaymentRequestDto
  ): Promise<PaymentResponseDto> {
    const actor = await this.identityAccessService.getAuthorizedEmployee(
      sessionToken,
      'payments:create',
      ['office-web']
    );

    const created = await this.paymentsRepository.recordDeposit(jobId, {
      amount: request.amount,
      method: request.method,
      receivedAt: request.receivedAt ?? new Date().toISOString(),
      reference: request.reference?.trim() || undefined,
      memo: request.memo?.trim() || undefined,
      actor: { id: actor.id, displayName: actor.displayName }
    });
    return { payment: this.toSummary(created) };
  }

  /** List a job's payments (newest first). Office-only, gated on payments:view. */
  async getJobPayments(sessionToken: string, jobId: string): Promise<JobPaymentsResponseDto> {
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'payments:view', [
      'office-web'
    ]);
    // getJobById throws NotFoundException when the job is missing.
    await this.jobsDataService.getJobById(jobId);

    const [payments, refunds, onlineRefundRequests] = await Promise.all([
      this.paymentsRepository.listPaymentsForJob(jobId),
      this.paymentsRepository.listRefundsForJob(jobId),
      this.onlineRefundsRepository.listForJob(jobId)
    ]);
    const visibleOnlineRefundRequests = this.filterVisibleOnlineRefundRequests(
      onlineRefundRequests,
      payments,
      refunds
    );
    return {
      payments: payments.map((payment) => this.toSummary(payment)),
      refunds: refunds.map((refund) => this.toRefundSummary(refund)),
      onlineRefundRequests: visibleOnlineRefundRequests.map((item) =>
        this.toOnlineRefundSummary(item)
      )
    };
  }

  /**
   * Refund all or part of a payment (the correction path for money already
   * received; payments are never edited in place). Office-only, gated on
   * payments:refund. v1 records manual refunds; online card refunds are recorded
   * by the worker from a confirmed Stripe event.
   */
  async refundPayment(
    sessionToken: string,
    paymentId: string,
    request: RecordRefundRequestDto
  ): Promise<PaymentRefundResponseDto> {
    const actor = await this.identityAccessService.getAuthorizedEmployee(
      sessionToken,
      'payments:refund',
      ['office-web']
    );

    const refund = await this.paymentsRepository.refundPayment(paymentId, {
      amount: request.amount,
      reason: request.reason?.trim() || undefined,
      actor: { id: actor.id, displayName: actor.displayName }
    });
    return { refund: this.toRefundSummary(refund) };
  }

  /**
   * Void a payment (the correction path; payments are never edited in place).
   * Office-only, gated on payments:edit.
   */
  async voidPayment(
    sessionToken: string,
    paymentId: string,
    request: VoidPaymentRequestDto
  ): Promise<PaymentResponseDto> {
    const actor = await this.identityAccessService.getAuthorizedEmployee(
      sessionToken,
      'payments:edit',
      ['office-web']
    );

    const voided = await this.paymentsRepository.voidPayment(paymentId, request.reason, {
      id: actor.id,
      displayName: actor.displayName
    });
    return { payment: this.toSummary(voided) };
  }

  /** Drop the internal recorded-by employee id from the wire shape. */
  private toSummary(record: PaymentRecord): PaymentSummaryDto {
    return {
      id: record.id,
      jobId: record.jobId,
      invoiceId: record.invoiceId,
      amount: record.amount,
      method: record.method,
      source: record.source,
      purpose: record.purpose,
      provider: record.provider,
      currency: record.currency,
      receivedAt: record.receivedAt,
      reference: record.reference,
      memo: record.memo,
      recordedByName: record.recordedByName,
      processorFee: record.processorFee,
      applicationFee: record.applicationFee,
      providerPaymentId: record.providerPaymentId,
      providerSessionId: record.providerSessionId,
      allocations: record.allocations,
      isVoid: record.isVoid,
      voidReason: record.voidReason,
      voidedByName: record.voidedByName,
      voidedAt: record.voidedAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    };
  }

  /**
   * Map a pending/failed online-refund request to the office wire shape. A request
   * the relay accepted carries a provider refund id and is awaiting worker
   * confirmation (`submitted`); without one it never cleanly reached the processor
   * and the office can retry (`needsResubmit`). No raw provider error text leaves here.
   */
  private toOnlineRefundSummary(item: OnlineRefundRequestListItem): OnlineRefundRequestSummaryDto {
    // A failed request the worker tried to apply (apply_attempt_count > 0) is a
    // dead-letter: the PROCESSOR accepted the refund but BellField could not record
    // it. That must NOT be re-requested (it would double-refund), so surface it as
    // recordingFailed rather than a clean, re-requestable failure.
    const status =
      item.status === 'failed' && item.applyAttemptCount > 0 ? 'recordingFailed' : item.status;
    return {
      id: item.id,
      paymentId: item.paymentId,
      amount: item.amount,
      currency: item.currency,
      status,
      submissionState: item.providerRefundId ? 'submitted' : 'needsResubmit',
      requestedAt: item.requestedAt
    };
  }

  private filterVisibleOnlineRefundRequests(
    requests: OnlineRefundRequestListItem[],
    payments: PaymentRecord[],
    refunds: RefundRecord[]
  ): OnlineRefundRequestListItem[] {
    const paymentCentsById = new Map(
      payments.map((payment) => [payment.id, dollarsToCents(payment.amount)])
    );
    const refundedCentsByPaymentId = new Map<string, number>();
    for (const refund of refunds) {
      refundedCentsByPaymentId.set(
        refund.paymentId,
        (refundedCentsByPaymentId.get(refund.paymentId) ?? 0) + dollarsToCents(refund.amount)
      );
    }

    return requests.filter((request) => {
      if (request.status === 'requested' || request.applyAttemptCount > 0) {
        return true;
      }

      const paymentCents = paymentCentsById.get(request.paymentId);
      if (paymentCents === undefined) {
        return true;
      }

      // A clean failed submission is retryable only while the payment still has
      // refundable balance. Once later confirmed refunds fully cover the payment,
      // showing the stale failure makes the office think there is work left.
      const refundedCents = refundedCentsByPaymentId.get(request.paymentId) ?? 0;
      return paymentCents > refundedCents;
    });
  }

  /** Drop internal-only fields from the refund wire shape. */
  private toRefundSummary(record: RefundRecord): PaymentRefundSummaryDto {
    return {
      id: record.id,
      paymentId: record.paymentId,
      jobId: record.jobId,
      amount: record.amount,
      method: record.method,
      source: record.source,
      provider: record.provider,
      currency: record.currency,
      refundedAt: record.refundedAt,
      reason: record.reason,
      recordedByName: record.recordedByName,
      applicationFeeRefunded: record.applicationFeeRefunded,
      providerRefundId: record.providerRefundId,
      providerPaymentId: record.providerPaymentId,
      allocations: record.allocations,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    };
  }
}

function dollarsToCents(amount: number): number {
  return Math.round(amount * 100);
}
