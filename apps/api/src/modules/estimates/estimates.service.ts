import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import {
  priceEstimate,
  type EstimateDiscount as EngineDiscount,
  type EstimatePricingLine
} from '@bellfield/estimating';
import { IdentityAccessService } from '../identity-access/identity-access.service';
import { JobsDataService } from '../company-data/jobs-data.service';
import { EstimatesRepository } from './estimates.repository';
import type {
  CreateEstimateRequestDto,
  DeclineEstimateRequestDto,
  EstimateRecord,
  EstimateResponseDto,
  EstimatesResponseDto,
  EstimateSummaryDto,
  EstimateTotalsRecord,
  EstimateWriteInput,
  UpdateEstimateRequestDto
} from './estimates.types';
import type { EstimateDiscountValue, EstimateLineItemInputValue } from './estimates.types';

@Injectable()
export class EstimatesService {
  constructor(
    private readonly identityAccessService: IdentityAccessService,
    private readonly jobsDataService: JobsDataService,
    private readonly estimatesRepository: EstimatesRepository
  ) {}

  async listEstimatesForJob(sessionToken: string, jobId: string): Promise<EstimatesResponseDto> {
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'estimates:view');
    await this.ensureJobExists(jobId);
    const estimates = await this.estimatesRepository.listEstimatesForJob(jobId);
    return { estimates: estimates.map((estimate) => this.toSummary(estimate)) };
  }

  async getEstimate(sessionToken: string, estimateId: string): Promise<EstimateResponseDto> {
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'estimates:view');
    const estimate = await this.requireEstimate(estimateId);
    return { estimate: this.toSummary(estimate) };
  }

  async createEstimate(
    sessionToken: string,
    jobId: string,
    request: CreateEstimateRequestDto
  ): Promise<EstimateResponseDto> {
    const actor = await this.identityAccessService.getAuthorizedEmployee(
      sessionToken,
      'estimates:create'
    );
    await this.ensureJobExists(jobId);

    const writeInput = this.buildWriteInput(
      request.title,
      request.description,
      request.taxRateBasisPoints,
      request.discount,
      request.validUntil,
      request.lineItems
    );

    const created = await this.estimatesRepository.createEstimate(jobId, writeInput, actor);
    return { estimate: this.toSummary(created) };
  }

  async updateEstimate(
    sessionToken: string,
    estimateId: string,
    request: UpdateEstimateRequestDto
  ): Promise<EstimateResponseDto> {
    const actor = await this.identityAccessService.getAuthorizedEmployee(
      sessionToken,
      'estimates:edit'
    );
    const existing = await this.requireEstimate(estimateId);

    // Strict lifecycle: only a pending estimate may be edited. Approved/declined
    // estimates are immutable records; revising means creating a new estimate.
    if (existing.status !== 'pending') {
      throw new ConflictException(
        'Only pending estimates can be edited. Create a new estimate to revise an approved or declined one.'
      );
    }

    // A PUT replaces the whole estimate; fall back to existing values for any
    // field the caller omitted so a partial payload does not silently blank data.
    const writeInput = this.buildWriteInput(
      request.title ?? existing.title,
      request.description !== undefined ? request.description : existing.description,
      request.taxRateBasisPoints ?? existing.taxRateBasisPoints,
      request.discount !== undefined ? (request.discount ?? undefined) : existing.discount,
      request.validUntil !== undefined ? (request.validUntil ?? undefined) : existing.validUntil,
      request.lineItems ?? existing.lineItems.map(toLineInput)
    );

    const updated = await this.estimatesRepository.replaceEstimate(estimateId, writeInput, actor);
    if (!updated) {
      throw new NotFoundException('Estimate not found.');
    }
    return { estimate: this.toSummary(updated) };
  }

  async approveEstimate(sessionToken: string, estimateId: string): Promise<EstimateResponseDto> {
    const actor = await this.identityAccessService.getAuthorizedEmployee(
      sessionToken,
      'estimates:approve'
    );
    const existing = await this.requireEstimate(estimateId);
    if (existing.status !== 'pending') {
      throw new ConflictException(
        `Only pending estimates can be approved (status: ${existing.status}).`
      );
    }

    const approved = await this.estimatesRepository.approveEstimate(estimateId, actor);
    if (!approved) {
      throw new NotFoundException('Estimate not found.');
    }
    return { estimate: this.toSummary(approved) };
  }

  async declineEstimate(
    sessionToken: string,
    estimateId: string,
    request: DeclineEstimateRequestDto
  ): Promise<EstimateResponseDto> {
    const actor = await this.identityAccessService.getAuthorizedEmployee(
      sessionToken,
      'estimates:approve'
    );
    const existing = await this.requireEstimate(estimateId);
    if (existing.status !== 'pending') {
      throw new ConflictException(
        `Only pending estimates can be declined (status: ${existing.status}).`
      );
    }

    const declined = await this.estimatesRepository.declineEstimate(
      estimateId,
      request.reason,
      actor
    );
    if (!declined) {
      throw new NotFoundException('Estimate not found.');
    }
    return { estimate: this.toSummary(declined) };
  }

  /**
   * Validate inputs and run the shared pricing engine, producing the persisted
   * snapshot. The engine is the single source of money truth; clients never send
   * computed totals, so the office app, the API, and (later) the field app all
   * agree on the same numbers.
   */
  private buildWriteInput(
    title: string,
    description: string | undefined,
    taxRateBasisPoints: number | undefined,
    discount: EstimateDiscountValue | undefined,
    validUntil: string | undefined,
    lineItems: EstimateLineItemInputValue[]
  ): EstimateWriteInput {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      throw new BadRequestException('Estimate title is required.');
    }
    if (lineItems.length === 0) {
      throw new BadRequestException('An estimate needs at least one line item.');
    }

    const resolvedTaxRate = taxRateBasisPoints ?? 0;
    // Defensively validate the discount shape. The DTO only checks that it is an
    // object, so a malformed payload like { kind: 'bogus', amount: 50 } reaches
    // here; normalize it into a known discriminated union or reject it, rather
    // than silently treating any non-percent kind as a fixed discount.
    const normalizedDiscount = normalizeDiscount(discount);

    let priced;
    try {
      priced = priceEstimate(lineItems.map(toPricingLine), {
        taxRateBasisPoints: resolvedTaxRate,
        discount: toEngineDiscount(normalizedDiscount)
      });
    } catch (error) {
      // The engine throws RangeError on invalid money/quantity; surface it as a
      // 400 rather than a 500 since it reflects bad client input.
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Estimate pricing failed.'
      );
    }

    const totals: EstimateTotalsRecord = {
      subtotal: priced.subtotalDollars,
      discount: priced.discountDollars,
      taxableBase: priced.taxableBaseDollars,
      tax: priced.taxDollars,
      total: priced.totalDollars,
      totalCost: priced.margin.totalCostDollars,
      profit: priced.margin.profitDollars,
      marginBasisPoints: priced.margin.marginBasisPoints,
      costComplete: priced.margin.costComplete
    };

    return {
      title: trimmedTitle,
      description: description?.trim() || undefined,
      taxRateBasisPoints: resolvedTaxRate,
      discount: normalizedDiscount,
      validUntil: validUntil || undefined,
      lineItems,
      totals,
      lineTotals: priced.lines.map((line) => ({
        lineSubtotal: line.sellTotalDollars,
        lineCost: line.costTotalDollars
      }))
    };
  }

  private async ensureJobExists(jobId: string): Promise<void> {
    // getJobById throws NotFoundException when the job is missing.
    await this.jobsDataService.getJobById(jobId);
  }

  private async requireEstimate(estimateId: string): Promise<EstimateRecord> {
    const estimate = await this.estimatesRepository.getEstimateById(estimateId);
    if (!estimate) {
      throw new NotFoundException('Estimate not found.');
    }
    return estimate;
  }

  private toSummary(record: EstimateRecord): EstimateSummaryDto {
    // The record shape already matches the contract summary one-to-one.
    return record;
  }
}

function toPricingLine(line: EstimateLineItemInputValue): EstimatePricingLine {
  return {
    quantity: line.quantity,
    unitPriceDollars: line.unitPrice,
    unitCostDollars: line.unitCost,
    taxable: line.taxable
  };
}

/**
 * Validate a client-supplied discount into a known discriminated union. The DTO
 * only guarantees `discount` is an object, so this is the real gate: an unknown
 * kind, a missing/invalid value, or extra-but-wrong fields are rejected with a
 * 400 instead of being coerced into a fixed discount.
 */
function normalizeDiscount(
  discount: EstimateDiscountValue | undefined
): EstimateDiscountValue | undefined {
  if (discount === undefined || discount === null) {
    return undefined;
  }
  const candidate = discount as { kind?: unknown; basisPoints?: unknown; amount?: unknown };

  if (candidate.kind === 'percent') {
    if (
      typeof candidate.basisPoints !== 'number' ||
      !Number.isFinite(candidate.basisPoints) ||
      candidate.basisPoints < 0
    ) {
      throw new BadRequestException(
        'A percent discount needs a basisPoints value of zero or more.'
      );
    }
    return { kind: 'percent', basisPoints: candidate.basisPoints };
  }

  if (candidate.kind === 'fixed') {
    if (
      typeof candidate.amount !== 'number' ||
      !Number.isFinite(candidate.amount) ||
      candidate.amount < 0
    ) {
      throw new BadRequestException('A fixed discount needs an amount of zero or more.');
    }
    return { kind: 'fixed', amount: candidate.amount };
  }

  throw new BadRequestException("Discount kind must be 'percent' or 'fixed'.");
}

function toEngineDiscount(discount: EstimateDiscountValue | undefined): EngineDiscount | undefined {
  if (!discount) {
    return undefined;
  }
  if (discount.kind === 'percent') {
    return { kind: 'percent', basisPoints: discount.basisPoints };
  }
  return { kind: 'fixed', amountDollars: discount.amount };
}

function toLineInput(line: {
  kind: EstimateLineItemInputValue['kind'];
  description: string;
  quantity: number;
  unitOfMeasure?: string;
  unitPrice: number;
  unitCost?: number;
  taxable: boolean;
  partNumber?: string;
  inventorySourceLabel?: string;
}): EstimateLineItemInputValue {
  return {
    kind: line.kind,
    description: line.description,
    quantity: line.quantity,
    unitOfMeasure: line.unitOfMeasure,
    unitPrice: line.unitPrice,
    unitCost: line.unitCost,
    taxable: line.taxable,
    partNumber: line.partNumber,
    inventorySourceLabel: line.inventorySourceLabel
  };
}
