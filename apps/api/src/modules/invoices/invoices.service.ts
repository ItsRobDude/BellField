import { Injectable, NotFoundException } from '@nestjs/common';
import { IdentityAccessService } from '../identity-access/identity-access.service';
import { JobsDataService } from '../company-data/jobs-data.service';
import { InvoicesRepository } from './invoices.repository';
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

    const invoice = await this.invoicesRepository.getMainInvoiceForJob(jobId);
    if (!invoice) {
      // Every job should own a main draft (created eagerly + backfilled). A missing
      // one means a data-integrity gap rather than a normal state, so surface it.
      throw new NotFoundException('This job has no main invoice draft.');
    }

    return { invoice: this.toSummary(invoice) };
  }

  private toSummary(record: InvoiceRecord): InvoiceSummaryDto {
    // The record shape already matches the contract summary one-to-one.
    return record;
  }
}
