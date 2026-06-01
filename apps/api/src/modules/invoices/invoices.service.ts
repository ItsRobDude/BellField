import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import type { InvoiceLineItemInput, VoidInvoiceLineItemRequest } from '@bellfield/contracts';
import { IdentityAccessService } from '../identity-access/identity-access.service';
import { JobsDataService } from '../company-data/jobs-data.service';
import { ReferenceDataService } from '../company-data/reference-data.service';
import { InvoicesRepository, type InvoiceLineWriteInput } from './invoices.repository';
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
    private readonly invoicesRepository: InvoicesRepository
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
    return { invoice: this.toSummary(await this.requireMainInvoice(context.jobId)) };
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
    return { invoice: this.toSummary(await this.requireMainInvoice(context.jobId)) };
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

    // Freeze the bill-to customer and service location exactly as they read now. These
    // getters throw NotFound when a referenced record is missing, which correctly blocks
    // a post against broken references rather than freezing empty context.
    const [billToCustomer, serviceLocation] = await Promise.all([
      this.referenceDataService.getCustomerById(job.billToCustomerId),
      this.referenceDataService.getLocationById(job.locationId)
    ]);

    const snapshot: PostedSnapshotInput = {
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

    await this.invoicesRepository.postInvoice(jobId, snapshot, actor);
    return { invoice: this.toSummary(await this.requireMainInvoice(jobId)) };
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
