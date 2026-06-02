import { Injectable } from '@nestjs/common';
import { IdentityAccessService } from '../identity-access/identity-access.service';
import { JobsDataService } from '../company-data/jobs-data.service';
import { PaymentsRepository } from './payments.repository';
import type {
  JobPaymentsResponseDto,
  PaymentRecord,
  PaymentResponseDto,
  PaymentSummaryDto,
  RecordPaymentRequestDto,
  VoidPaymentRequestDto
} from './payments.types';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly identityAccessService: IdentityAccessService,
    private readonly jobsDataService: JobsDataService,
    private readonly paymentsRepository: PaymentsRepository
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

  /** List a job's payments (newest first). Office-only, gated on payments:view. */
  async getJobPayments(sessionToken: string, jobId: string): Promise<JobPaymentsResponseDto> {
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'payments:view', [
      'office-web'
    ]);
    // getJobById throws NotFoundException when the job is missing.
    await this.jobsDataService.getJobById(jobId);

    const payments = await this.paymentsRepository.listPaymentsForJob(jobId);
    return { payments: payments.map((payment) => this.toSummary(payment)) };
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
      invoiceId: record.invoiceId,
      amount: record.amount,
      method: record.method,
      receivedAt: record.receivedAt,
      reference: record.reference,
      memo: record.memo,
      recordedByName: record.recordedByName,
      isVoid: record.isVoid,
      voidReason: record.voidReason,
      voidedByName: record.voidedByName,
      voidedAt: record.voidedAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    };
  }
}
