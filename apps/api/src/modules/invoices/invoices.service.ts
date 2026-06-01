import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import type { InvoiceLineItemInput, VoidInvoiceLineItemRequest } from '@bellfield/contracts';
import { IdentityAccessService } from '../identity-access/identity-access.service';
import { JobsDataService } from '../company-data/jobs-data.service';
import { InvoicesRepository, type InvoiceLineWriteInput } from './invoices.repository';
import type { InvoiceRecord, InvoiceResponseDto, InvoiceSummaryDto } from './invoices.types';

@Injectable()
export class InvoicesService {
  constructor(
    private readonly identityAccessService: IdentityAccessService,
    private readonly jobsDataService: JobsDataService,
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
      // Posting/locking is Milestone 8; for now a non-draft is not editable.
      throw new ConflictException('Only draft invoices can be edited.');
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
