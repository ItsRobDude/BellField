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
import type {
  CatalogLineSnapshot,
  CatalogItemKind,
  CatalogPriceMode,
  ConvertEstimateToInvoiceRequest,
  InvoiceResponse
} from '@bellfield/contracts';
import { IdentityAccessService } from '../identity-access/identity-access.service';
import { JobsDataService } from '../company-data/jobs-data.service';
import { InvoicesRepository, type EstimateConversionInput } from '../invoices/invoices.repository';
import { EstimatesRepository } from './estimates.repository';
import type {
  ApproveEstimateRequestDto,
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
import type {
  EstimateDiscountValue,
  EstimateLineItemInputValue,
  EstimateOptionGroupInputValue
} from './estimates.types';
import {
  findOption,
  getConvertibleLines,
  normalizeOptionGroups,
  priceOptionGroups,
  resolveSelectedOptionForWrite,
  toOptionGroupInput,
  toTotalsRecordFromEngine,
  validateOptionLineMembership
} from './estimates-options';

@Injectable()
export class EstimatesService {
  constructor(
    private readonly identityAccessService: IdentityAccessService,
    private readonly jobsDataService: JobsDataService,
    private readonly estimatesRepository: EstimatesRepository,
    private readonly invoicesRepository: InvoicesRepository
  ) {}

  async listEstimatesForJob(sessionToken: string, jobId: string): Promise<EstimatesResponseDto> {
    // Estimates are an office-only surface in this milestone: the field app has no
    // estimate builder yet, and these endpoints do no per-technician assignment
    // scoping, so a field session must not reach them. Restrict to office-web.
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'estimates:view', [
      'office-web'
    ]);
    await this.ensureJobExists(jobId);
    const estimates = await this.estimatesRepository.listEstimatesForJob(jobId);
    return { estimates: estimates.map((estimate) => this.toSummary(estimate)) };
  }

  async getEstimate(sessionToken: string, estimateId: string): Promise<EstimateResponseDto> {
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'estimates:view', [
      'office-web'
    ]);
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
      'estimates:create',
      ['office-web']
    );
    await this.ensureJobExists(jobId);
    await this.validateCatalogReferences(request.lineItems);

    const writeInput = this.buildWriteInput(
      request.title,
      request.description,
      request.taxRateBasisPoints,
      request.discount,
      request.validUntil,
      request.optionGroups,
      request.selectedOptionId,
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
      'estimates:edit',
      ['office-web']
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
    const lineItems = request.lineItems ?? existing.lineItems.map(toLineInput);
    await this.validateCatalogReferences(lineItems);

    const writeInput = this.buildWriteInput(
      request.title ?? existing.title,
      request.description !== undefined ? request.description : existing.description,
      request.taxRateBasisPoints ?? existing.taxRateBasisPoints,
      request.discount !== undefined ? (request.discount ?? undefined) : existing.discount,
      request.validUntil !== undefined ? (request.validUntil ?? undefined) : existing.validUntil,
      request.optionGroups !== undefined
        ? (request.optionGroups ?? undefined)
        : existing.optionGroups?.map(toOptionGroupInput),
      request.selectedOptionId !== undefined
        ? (request.selectedOptionId ?? undefined)
        : existing.selectedOptionId,
      lineItems
    );

    const updated = await this.estimatesRepository.replaceEstimate(estimateId, writeInput, actor);
    if (!updated) {
      throw new NotFoundException('Estimate not found.');
    }
    return { estimate: this.toSummary(updated) };
  }

  async approveEstimate(
    sessionToken: string,
    estimateId: string,
    request: ApproveEstimateRequestDto = {}
  ): Promise<EstimateResponseDto> {
    const actor = await this.identityAccessService.getAuthorizedEmployee(
      sessionToken,
      'estimates:approve',
      ['office-web']
    );
    const existing = await this.requireEstimate(estimateId);
    if (existing.status !== 'pending') {
      throw new ConflictException(
        `Only pending estimates can be approved (status: ${existing.status}).`
      );
    }

    const approvedOption = this.resolveApprovedOption(existing, request.selectedOptionId);
    const approved = await this.estimatesRepository.approveEstimate(
      estimateId,
      actor,
      approvedOption
    );
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
      'estimates:approve',
      ['office-web']
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
   * Convert an approved estimate into its job's invoice draft. Explicit office
   * action (never automatic on approval). Copies the estimate's frozen snapshot
   * into the draft and stamps audit metadata on the estimate without touching its
   * money or status. Gated on invoices:create, since converting commits quoted
   * work to the bill.
   */
  async convertToInvoice(
    sessionToken: string,
    estimateId: string,
    request: ConvertEstimateToInvoiceRequest
  ): Promise<InvoiceResponse> {
    const actor = await this.identityAccessService.getAuthorizedEmployee(
      sessionToken,
      'invoices:create',
      ['office-web']
    );

    // These checks give friendly, specific errors up front. The conversion
    // itself re-validates atomically (the guarded estimate claim inside the
    // transaction), so these are a good-UX layer, not the safety boundary.
    const estimate = await this.requireEstimate(estimateId);
    if (estimate.status !== 'approved') {
      throw new ConflictException(
        `Only approved estimates can be converted to an invoice (status: ${estimate.status}).`
      );
    }
    if (estimate.supersededByEstimateId) {
      throw new ConflictException(
        'This estimate has been superseded by a newer one and cannot be converted.'
      );
    }
    if (estimate.convertedToInvoiceId) {
      throw new ConflictException('This estimate has already been converted to an invoice.');
    }

    // Block-with-choice (friendly pre-check): if the draft already has active
    // lines, the caller must say whether to append or replace, so conversion
    // never silently duplicates. This is a fast, specific error for the common
    // case — the AUTHORITATIVE gate lives inside convertEstimateIntoDraft, which
    // re-counts in-transaction so a line added between here and the conversion
    // can't slip through as a silent append.
    const activeLines = await this.invoicesRepository.countActiveLines(estimate.jobId);
    if (activeLines > 0 && !request.mode) {
      throw new ConflictException(
        'The invoice draft already has lines. Choose "append" or "replace" to convert this estimate.'
      );
    }

    const conversionInput: EstimateConversionInput = {
      estimateId: estimate.id,
      estimateTitle: estimate.title,
      taxRateBasisPoints: estimate.taxRateBasisPoints,
      discount: estimate.discount,
      actor: { id: actor.id, displayName: actor.displayName },
      lines: getConvertibleLines(estimate).map((line) => ({
        estimateLineItemId: line.id,
        kind: line.kind,
        description: line.description,
        quantity: line.quantity,
        unitOfMeasure: line.unitOfMeasure,
        unitPrice: line.unitPrice,
        unitCost: line.unitCost,
        taxable: line.taxable,
        partNumber: line.partNumber,
        inventorySourceLabel: line.inventorySourceLabel,
        lineSubtotal: line.lineSubtotal,
        lineCost: line.lineCost
      }))
    };

    // Atomic: claims the estimate, copies lines, stamps audit/timeline, recomputes.
    // Pass the caller's choice through unchanged (may be undefined); the repository
    // enforces the block-with-choice gate in-transaction.
    const { invoiceId } = await this.invoicesRepository.convertEstimateIntoDraft(
      estimate.jobId,
      conversionInput,
      request.mode
    );

    const invoice = await this.invoicesRepository.getMainInvoiceForJob(estimate.jobId);
    if (!invoice || invoice.id !== invoiceId) {
      throw new NotFoundException('This job has no main invoice draft.');
    }

    return { invoice };
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
    optionGroups: EstimateOptionGroupInputValue[] | undefined,
    selectedOptionId: string | undefined,
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

    const normalizedOptionGroups = normalizeOptionGroups(optionGroups);
    const selectedOption = resolveSelectedOptionForWrite(normalizedOptionGroups, selectedOptionId);
    validateOptionLineMembership(lineItems, normalizedOptionGroups);

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

    const optionGroupsWithTotals = normalizedOptionGroups
      ? priceOptionGroups(normalizedOptionGroups, lineItems, resolvedTaxRate, normalizedDiscount)
      : undefined;
    const selectedOptionTotals =
      optionGroupsWithTotals && selectedOption
        ? findOption(optionGroupsWithTotals, selectedOption.id)?.totals
        : undefined;
    const defaultOptionTotals = optionGroupsWithTotals?.[0]?.options[0]?.totals;
    const totals = toTotalsRecordFromEngine(selectedOptionTotals ?? defaultOptionTotals ?? priced);

    return {
      title: trimmedTitle,
      description: description?.trim() || undefined,
      taxRateBasisPoints: resolvedTaxRate,
      discount: normalizedDiscount,
      validUntil: validUntil || undefined,
      lineItems,
      totals,
      optionGroups: optionGroupsWithTotals,
      selectedOptionId: selectedOption?.id,
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

  private async validateCatalogReferences(lineItems: EstimateLineItemInputValue[]): Promise<void> {
    const catalogItemIds = [
      ...new Set(
        lineItems
          .map((line) => line.catalogItemId?.trim())
          .filter((catalogItemId): catalogItemId is string => Boolean(catalogItemId))
      )
    ];
    for (const catalogItemId of catalogItemIds) {
      if (!(await this.estimatesRepository.catalogItemExists(catalogItemId))) {
        throw new NotFoundException('Catalog item not found.');
      }
    }

    for (const line of lineItems) {
      if (line.catalogSnapshot) {
        validateCatalogSnapshot(line.catalogSnapshot);
      }
      if (
        line.catalogItemId &&
        line.catalogSnapshot?.catalogItemId &&
        line.catalogSnapshot.catalogItemId !== line.catalogItemId
      ) {
        throw new BadRequestException('Catalog snapshot must match the selected Catalog item.');
      }
    }
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

  private resolveApprovedOption(
    estimate: EstimateRecord,
    requestedOptionId: string | undefined
  ): { selectedOptionId?: string; totals?: EstimateTotalsRecord } {
    if (!estimate.optionGroups || estimate.optionGroups.length === 0) {
      if (requestedOptionId) {
        throw new BadRequestException('This estimate has no options to approve.');
      }
      return {};
    }

    const selectedOptionId = requestedOptionId?.trim() || estimate.selectedOptionId;
    if (!selectedOptionId) {
      throw new BadRequestException('Choose one estimate option before approving.');
    }

    const selectedOption = findOption(estimate.optionGroups, selectedOptionId);
    if (!selectedOption) {
      throw new BadRequestException('Selected estimate option was not found.');
    }

    return { selectedOptionId: selectedOption.id, totals: selectedOption.totals };
  }
}

const catalogItemKinds = [
  'service',
  'part',
  'equipment',
  'labor',
  'fee',
  'discount',
  'agreement',
  'other'
] as const satisfies readonly CatalogItemKind[];

const catalogPriceModes = ['standard', 'agreement'] as const satisfies readonly CatalogPriceMode[];

function toPricingLine(line: EstimateLineItemInputValue): EstimatePricingLine {
  return {
    quantity: line.quantity,
    unitPriceDollars: line.unitPrice,
    unitCostDollars: line.unitCost,
    taxable: line.taxable
  };
}

function validateCatalogSnapshot(snapshot: CatalogLineSnapshot): void {
  const candidate = snapshot as unknown as Record<string, unknown>;
  validateOptionalString(candidate.catalogItemId, 'Catalog snapshot item id', 120);
  validateOptionalString(candidate.code, 'Catalog snapshot code', 80);
  validateRequiredString(candidate.name, 'Catalog snapshot name', 160);
  validateCatalogKind(candidate.kind);
  validateOptionalString(candidate.category, 'Catalog snapshot category', 120);
  validateOptionalString(candidate.description, 'Catalog snapshot description', 1000);
  validateOptionalString(candidate.unitOfMeasure, 'Catalog snapshot unit', 40);
  validateOptionalNumber(candidate.selectedUnitPrice, 'Catalog snapshot selected unit price');
  validateBoolean(candidate.taxable, 'Catalog snapshot taxable');
  validateCatalogPriceMode(candidate.priceMode);
  validateOptionalNumber(candidate.defaultSalePrice, 'Catalog snapshot default sale price');
  validateOptionalNumber(candidate.agreementPrice, 'Catalog snapshot agreement price');
  validateOptionalString(
    candidate.linkedInventoryItemId,
    'Catalog snapshot inventory item id',
    120
  );
  validateOptionalString(
    candidate.linkedInventoryItemSku,
    'Catalog snapshot inventory item sku',
    120
  );
  validateOptionalString(
    candidate.linkedInventoryItemName,
    'Catalog snapshot inventory item name',
    160
  );
}

function validateCatalogKind(value: unknown): void {
  if (typeof value !== 'string' || !catalogItemKinds.includes(value as CatalogItemKind)) {
    throw new BadRequestException('Catalog snapshot kind is invalid.');
  }
}

function validateCatalogPriceMode(value: unknown): void {
  if (typeof value !== 'string' || !catalogPriceModes.includes(value as CatalogPriceMode)) {
    throw new BadRequestException('Catalog snapshot price mode is invalid.');
  }
}

function validateRequiredString(value: unknown, label: string, maxLength: number): void {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException(`${label} is required.`);
  }
  validateOptionalString(value, label, maxLength);
}

function validateOptionalString(value: unknown, label: string, maxLength: number): void {
  if (value === undefined) {
    return;
  }
  if (typeof value !== 'string' || value.length > maxLength) {
    throw new BadRequestException(`${label} is invalid.`);
  }
}

function validateOptionalNumber(value: unknown, label: string): void {
  if (value === undefined) {
    return;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BadRequestException(`${label} is invalid.`);
  }
}

function validateBoolean(value: unknown, label: string): void {
  if (typeof value !== 'boolean') {
    throw new BadRequestException(`${label} is invalid.`);
  }
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
    // A true discriminated union: a percent discount must not also carry a fixed
    // amount, so a conflicting payload can't slip past as "percent with junk".
    if (candidate.amount !== undefined) {
      throw new BadRequestException('A percent discount must not include a fixed amount.');
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
    if (candidate.basisPoints !== undefined) {
      throw new BadRequestException('A fixed discount must not include percent basisPoints.');
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
  catalogItemId?: string;
  catalogSnapshot?: EstimateLineItemInputValue['catalogSnapshot'];
  optionGroupId?: string;
  optionId?: string;
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
    inventorySourceLabel: line.inventorySourceLabel,
    catalogItemId: line.catalogItemId,
    catalogSnapshot: line.catalogSnapshot,
    optionGroupId: line.optionGroupId,
    optionId: line.optionId
  };
}
