import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import type {
  CreateAdjustmentRequest,
  InvoiceLineItemInput,
  JobInvoiceBalance,
  VoidInvoiceLineItemRequest
} from '@bellfield/contracts';
import { IdentityAccessService } from '../identity-access/identity-access.service';
import { JobsDataService } from '../company-data/jobs-data.service';
import { ReferenceDataService } from '../company-data/reference-data.service';
import { InvoicesRepository, type InvoiceLineWriteInput } from './invoices.repository';
import { PaymentsRepository } from './payments.repository';
import type {
  InvoiceRecord,
  InvoiceResponseDto,
  InvoiceSummaryDto,
  PostedSnapshotInput
} from './invoices.types';

@Injectable()
export class InvoicesService {
  constructor(
    private readonly identityAccessService: IdentityAccessService,
    private readonly jobsDataService: JobsDataService,
    private readonly referenceDataService: ReferenceDataService,
    private readonly invoicesRepository: InvoicesRepository,
    private readonly paymentsRepository: PaymentsRepository
  ) {}

  /** Load a job's single main invoice draft. Office-only, gated on invoices:view. */
  async getInvoiceForJob(sessionToken: string, jobId: string): Promise<InvoiceResponseDto> {
    // Office-only this milestone: there is no field-side invoice surface, matching
    // how estimates are gated.
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'invoices:view', [
      'office-web'
    ]);
    // getJobById throws NotFoundException when the job is missing.
    await this.jobsDataService.getJobById(jobId);

    const invoice = await this.requireMainInvoice(jobId);
    return { invoice: this.toSummary(invoice) };
  }

  /** Load any single invoice by id (main or an adjustment/credit). Office-only, invoices:view. */
  async getInvoice(sessionToken: string, invoiceId: string): Promise<InvoiceResponseDto> {
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'invoices:view', [
      'office-web'
    ]);
    return { invoice: this.toSummary(await this.requireInvoice(invoiceId)) };
  }

  /**
   * Net amount billed on a job: posted main total + posted adjustments − posted credits.
   * "Billed" means posted, so a draft main (and any draft correction) contributes 0;
   * `mainInvoiceStatus` says whether the main is posted yet. `netBilled` can be negative
   * (a net credit balance). Office-only, gated invoices:view. No payments are modeled yet,
   * so this is net billed, not amount owed after payment.
   */
  async getJobInvoiceBalance(sessionToken: string, jobId: string): Promise<JobInvoiceBalance> {
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'invoices:view', [
      'office-web'
    ]);
    // Base NotFound on real job existence, not on an empty invoice query.
    await this.jobsDataService.getJobById(jobId);

    const invoices = await this.invoicesRepository.listInvoiceTotalsForJob(jobId);
    const main = invoices.find((invoice) => invoice.invoiceKind === 'main');
    if (!main) {
      throw new NotFoundException('This job has no main invoice draft.');
    }

    // Sum in whole cents so repeated decimal-dollar addition can't drift. Stored totals are
    // numeric(12,2), so rounding dollars*100 is exact.
    const toCents = (dollars: number): number => Math.round(dollars * 100);
    const sumPostedCents = (kind: 'adjustment' | 'credit'): number =>
      invoices
        .filter((invoice) => invoice.invoiceKind === kind && invoice.status === 'posted')
        .reduce((cents, invoice) => cents + toCents(invoice.total), 0);

    const postedMainCents = main.status === 'posted' ? toCents(main.total) : 0;
    const postedAdjustmentsCents = sumPostedCents('adjustment');
    const postedCreditsCents = sumPostedCents('credit');
    const netBilledCents = postedMainCents + postedAdjustmentsCents - postedCreditsCents;

    // Payments are a ledger; amount due is derived (net billed − non-void payments)
    // rather than stored, so recording or voiding a payment never rewrites a posted
    // invoice. amountDue may be negative (an overpayment / credit balance).
    const paidCents = await this.paymentsRepository.sumActivePaymentCentsForJob(jobId);
    const amountDueCents = netBilledCents - paidCents;

    return {
      jobId,
      mainInvoiceStatus: main.status,
      postedMainTotal: postedMainCents / 100,
      postedAdjustmentsTotal: postedAdjustmentsCents / 100,
      postedCreditsTotal: postedCreditsCents / 100,
      netBilled: netBilledCents / 100,
      paidTotal: paidCents / 100,
      amountDue: amountDueCents / 100
    };
  }

  /**
   * List a job's adjustment/credit correction records (each a full invoice), newest first.
   * Office-only, gated on invoices:view. Empty until the main is posted and a correction is
   * created.
   */
  async getJobAdjustments(
    sessionToken: string,
    jobId: string
  ): Promise<{ adjustments: InvoiceSummaryDto[] }> {
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'invoices:view', [
      'office-web'
    ]);
    await this.jobsDataService.getJobById(jobId);

    const adjustments = await this.invoicesRepository.listAdjustmentsForJob(jobId);
    return { adjustments: adjustments.map((invoice) => this.toSummary(invoice)) };
  }

  /** Add a manual line to a job's invoice draft. */
  async addLine(
    sessionToken: string,
    jobId: string,
    request: InvoiceLineItemInput
  ): Promise<InvoiceResponseDto> {
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'invoices:edit', [
      'office-web'
    ]);
    await this.jobsDataService.getJobById(jobId);
    const invoice = await this.requireMainInvoice(jobId);
    this.ensureDraft(invoice);

    await this.invoicesRepository.addManualLine(jobId, this.validateLineInput(request));
    return { invoice: this.toSummary(await this.requireMainInvoice(jobId)) };
  }

  /** Edit an invoice line. Editing a register-sourced line detaches it. */
  async editLine(
    sessionToken: string,
    lineId: string,
    request: InvoiceLineItemInput
  ): Promise<InvoiceResponseDto> {
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'invoices:edit', [
      'office-web'
    ]);
    const context = await this.requireActiveLine(lineId);
    this.ensureDraftStatus(context.invoiceStatus);

    await this.invoicesRepository.editLine(
      lineId,
      context.invoiceId,
      this.validateLineInput(request)
    );
    // Reload the line's OWN invoice (which may be an adjustment), not the job's main.
    return { invoice: this.toSummary(await this.requireInvoice(context.invoiceId)) };
  }

  /** Void an invoice line. */
  async voidLine(
    sessionToken: string,
    lineId: string,
    request: VoidInvoiceLineItemRequest
  ): Promise<InvoiceResponseDto> {
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'invoices:edit', [
      'office-web'
    ]);
    const context = await this.requireActiveLine(lineId);
    this.ensureDraftStatus(context.invoiceStatus);

    await this.invoicesRepository.voidLine(lineId, context.invoiceId, request.reason);
    // Reload the line's OWN invoice (which may be an adjustment), not the job's main.
    return { invoice: this.toSummary(await this.requireInvoice(context.invoiceId)) };
  }

  /**
   * Post a job's main invoice draft: lock it and freeze the customer/location/job
   * display context so later CRM edits cannot rewrite this financial record. Office-only,
   * gated on invoices:post. Posting does NOT change job status — "posted" is an
   * invoice/accounting concept only. Corrections after posting use adjustment/credit
   * records (a later Milestone 8 lane), not edits to the locked invoice.
   */
  async postInvoice(sessionToken: string, jobId: string): Promise<InvoiceResponseDto> {
    const actor = await this.identityAccessService.getAuthorizedEmployee(
      sessionToken,
      'invoices:post',
      ['office-web']
    );
    const job = await this.jobsDataService.getJobById(jobId);
    const invoice = await this.requireMainInvoice(jobId);
    if (invoice.status !== 'draft') {
      // Friendly pre-check; the repository's guarded UPDATE is the real boundary.
      throw new ConflictException('Only draft invoices can be posted.');
    }

    const snapshot = await this.resolvePostingSnapshot(job);
    await this.invoicesRepository.postInvoice(invoice.id, snapshot, actor);
    return { invoice: this.toSummary(await this.requireMainInvoice(jobId)) };
  }

  /**
   * Post (lock) a specific invoice by id. Used for adjustment/credit records (the office
   * posts the main via postInvoice above). Same gate and snapshot-freeze as the main.
   */
  async postInvoiceById(sessionToken: string, invoiceId: string): Promise<InvoiceResponseDto> {
    const actor = await this.identityAccessService.getAuthorizedEmployee(
      sessionToken,
      'invoices:post',
      ['office-web']
    );
    const invoice = await this.requireInvoice(invoiceId);
    if (invoice.status !== 'draft') {
      throw new ConflictException('Only draft invoices can be posted.');
    }
    const job = await this.jobsDataService.getJobById(invoice.jobId);
    const snapshot = await this.resolvePostingSnapshot(job);
    await this.invoicesRepository.postInvoice(invoiceId, snapshot, actor);
    return { invoice: this.toSummary(await this.requireInvoice(invoiceId)) };
  }

  /**
   * Create a draft adjustment or credit against a job's posted main invoice (the
   * correction path for a locked bill). Office-only, gated on invoices:create. Both kinds
   * carry positive amounts; the kind conveys whether it adds a charge or a credit.
   */
  async createAdjustment(
    sessionToken: string,
    jobId: string,
    request: CreateAdjustmentRequest
  ): Promise<InvoiceResponseDto> {
    const actor = await this.identityAccessService.getAuthorizedEmployee(
      sessionToken,
      'invoices:create',
      ['office-web']
    );
    if (request.kind !== 'adjustment' && request.kind !== 'credit') {
      throw new BadRequestException('Kind must be "adjustment" or "credit".');
    }
    await this.jobsDataService.getJobById(jobId);
    const mainInvoice = await this.requireMainInvoice(jobId);
    if (mainInvoice.status !== 'posted') {
      // The correction path exists for a locked bill; there is nothing to correct while
      // the main invoice is still an editable draft.
      throw new ConflictException(
        'An adjustment or credit can only be created after the main invoice is posted.'
      );
    }

    const created = await this.invoicesRepository.createAdjustment(
      jobId,
      request.kind,
      mainInvoice.id,
      actor
    );
    return { invoice: this.toSummary(created) };
  }

  /** Add a manual line to a specific invoice by id (used for adjustment/credit lines). */
  async addInvoiceLine(
    sessionToken: string,
    invoiceId: string,
    request: InvoiceLineItemInput
  ): Promise<InvoiceResponseDto> {
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'invoices:edit', [
      'office-web'
    ]);
    const invoice = await this.requireInvoice(invoiceId);
    this.ensureDraft(invoice);

    await this.invoicesRepository.addLineToInvoice(invoiceId, this.validateLineInput(request));
    return { invoice: this.toSummary(await this.requireInvoice(invoiceId)) };
  }

  /**
   * Resolve the customer/location/job display context to freeze at posting, from the
   * invoice's job. The reference-data getters throw NotFound when a referenced record is
   * missing, which correctly blocks a post against broken references.
   */
  private async resolvePostingSnapshot(job: {
    billToCustomerId: string;
    locationId: string;
    jobNumber: string;
    workOrderNumber?: string;
  }): Promise<PostedSnapshotInput> {
    const [billToCustomer, serviceLocation] = await Promise.all([
      this.referenceDataService.getCustomerById(job.billToCustomerId),
      this.referenceDataService.getLocationById(job.locationId)
    ]);

    return {
      billToCustomerId: billToCustomer.id,
      billToCustomerName: billToCustomer.name,
      billToAccountType: billToCustomer.accountType,
      billToAddressLine1: billToCustomer.billingAddressLine1,
      billToCity: billToCustomer.billingCity,
      billToState: billToCustomer.billingState,
      billToPostalCode: billToCustomer.billingPostalCode,
      serviceLocationId: serviceLocation.id,
      serviceLocationName: serviceLocation.name,
      serviceLocationAddressLine1: serviceLocation.addressLine1,
      serviceLocationCity: serviceLocation.city,
      serviceLocationState: serviceLocation.state,
      serviceLocationPostalCode: serviceLocation.postalCode,
      jobNumber: job.jobNumber,
      workOrderNumber: job.workOrderNumber
    };
  }

  private validateLineInput(request: InvoiceLineItemInput): InvoiceLineWriteInput {
    const description = request.description?.trim();
    if (!description) {
      throw new BadRequestException('A line description is required.');
    }
    if (!Number.isFinite(request.quantity) || request.quantity <= 0) {
      throw new BadRequestException('Quantity must be greater than zero.');
    }
    if (!Number.isFinite(request.unitPrice) || request.unitPrice < 0) {
      throw new BadRequestException('Unit price must be zero or more.');
    }
    if (
      request.unitCost !== undefined &&
      (!Number.isFinite(request.unitCost) || request.unitCost < 0)
    ) {
      throw new BadRequestException('Unit cost must be zero or more.');
    }
    return {
      kind: request.kind,
      description,
      quantity: request.quantity,
      unitOfMeasure: request.unitOfMeasure,
      unitPrice: request.unitPrice,
      unitCost: request.unitCost,
      taxable: request.taxable
    };
  }

  private ensureDraft(invoice: InvoiceRecord): void {
    this.ensureDraftStatus(invoice.status);
  }

  private ensureDraftStatus(status: InvoiceRecord['status']): void {
    if (status !== 'draft') {
      // A posted invoice is the locked accounting record; corrections go through
      // adjustment/credit records, not edits to the posted invoice itself.
      throw new ConflictException('This invoice is posted and locked; it can no longer be edited.');
    }
  }

  private async requireMainInvoice(jobId: string): Promise<InvoiceRecord> {
    const invoice = await this.invoicesRepository.getMainInvoiceForJob(jobId);
    if (!invoice) {
      // Every job should own a main draft (created eagerly + backfilled). A missing
      // one means a data-integrity gap rather than a normal state, so surface it.
      throw new NotFoundException('This job has no main invoice draft.');
    }
    return invoice;
  }

  private async requireInvoice(invoiceId: string): Promise<InvoiceRecord> {
    const invoice = await this.invoicesRepository.getInvoiceById(invoiceId);
    if (!invoice) {
      throw new NotFoundException('Invoice not found.');
    }
    return invoice;
  }

  private async requireActiveLine(lineId: string) {
    const context = await this.invoicesRepository.getActiveLineContext(lineId);
    if (!context) {
      throw new NotFoundException('Invoice line not found.');
    }
    return context;
  }

  private toSummary(record: InvoiceRecord): InvoiceSummaryDto {
    // The record shape already matches the contract summary one-to-one.
    return record;
  }
}
