import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import type {
  CatalogItemKind,
  CatalogLineSnapshot,
  CatalogPriceMode,
  CustomerAccountSummary,
  EquipmentSummary,
  LocationSummary,
  ServiceAgreementVisitTemplate
} from '@bellfield/contracts';
import type {
  CustomerAccountRecord,
  EquipmentRecord,
  LocationRecord
} from '../company-data/company-data.types';
import { EquipmentDataService } from '../company-data/equipment-data.service';
import { ReferenceDataService } from '../company-data/reference-data.service';
import { IdentityAccessService } from '../identity-access/identity-access.service';
import { ServiceAgreementsRepository } from './service-agreements.repository';
import type {
  CreateServiceAgreementRequestDto,
  ServiceAgreementDto,
  ServiceAgreementReferenceDataResponseDto,
  ServiceAgreementResponseDto,
  ServiceAgreementsResponseDto,
  ServiceAgreementStatusChangeRequestDto,
  ServiceAgreementStatusValue,
  ServiceAgreementVisitTemplateInputDto,
  UpdateServiceAgreementRequestDto
} from './service-agreements.types';

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

@Injectable()
export class ServiceAgreementsService {
  constructor(
    private readonly identityAccessService: IdentityAccessService,
    private readonly referenceDataService: ReferenceDataService,
    private readonly equipmentDataService: EquipmentDataService,
    private readonly serviceAgreementsRepository: ServiceAgreementsRepository
  ) {}

  async listAgreements(
    sessionToken: string,
    filters: { customerId?: string; locationId?: string; status?: ServiceAgreementStatusValue }
  ): Promise<ServiceAgreementsResponseDto> {
    await this.authorize(sessionToken, 'agreements:view');
    return { agreements: await this.serviceAgreementsRepository.listAgreements(filters) };
  }

  async getAgreement(
    sessionToken: string,
    agreementId: string
  ): Promise<ServiceAgreementResponseDto> {
    await this.authorize(sessionToken, 'agreements:view');
    const agreement = await this.serviceAgreementsRepository.getAgreementById(agreementId);
    if (!agreement) {
      throw new NotFoundException('Service agreement not found.');
    }
    return { agreement };
  }

  async getReferenceData(
    sessionToken: string,
    agreementId?: string
  ): Promise<ServiceAgreementReferenceDataResponseDto> {
    const resolvedAgreementId = agreementId?.trim();
    const isEditMode = resolvedAgreementId !== undefined && resolvedAgreementId !== '';
    await this.authorize(sessionToken, isEditMode ? 'agreements:edit' : 'agreements:create');

    if (resolvedAgreementId) {
      const existing = await this.serviceAgreementsRepository.getAgreementById(resolvedAgreementId);
      if (!existing) {
        throw new NotFoundException('Service agreement not found.');
      }
    }

    const includeInactive = isEditMode;
    const [customers, locations, equipment] = await Promise.all([
      this.referenceDataService.listCustomers(includeInactive),
      this.referenceDataService.listLocations(includeInactive),
      this.equipmentDataService.listEquipment(includeInactive)
    ]);
    const customerById = new Map(customers.map((customer) => [customer.id, customer]));
    const locationById = new Map(locations.map((location) => [location.id, location]));

    return {
      customers: customers.map(toCustomerSummary),
      locations: locations.map((location) => toLocationSummary(location, customerById)),
      equipment: equipment.map((equipmentRecord) =>
        toEquipmentSummary(equipmentRecord, locationById, customerById)
      )
    };
  }

  async createAgreement(
    sessionToken: string,
    request: CreateServiceAgreementRequestDto
  ): Promise<ServiceAgreementResponseDto> {
    const actor = await this.authorize(sessionToken, 'agreements:create');
    const normalized = await this.validateAgreementMutation({
      ...request,
      billingCadence: request.billingCadence ?? 'none',
      coveredEquipmentIds: request.coveredEquipmentIds ?? [],
      visitTemplates: request.visitTemplates ?? []
    });
    return {
      agreement: await this.serviceAgreementsRepository.createAgreement(normalized, actor)
    };
  }

  async updateAgreement(
    sessionToken: string,
    agreementId: string,
    request: UpdateServiceAgreementRequestDto
  ): Promise<ServiceAgreementResponseDto> {
    const actor = await this.authorize(sessionToken, 'agreements:edit');
    const existing = await this.serviceAgreementsRepository.getAgreementById(agreementId);
    if (!existing) {
      throw new NotFoundException('Service agreement not found.');
    }
    if (existing.status === 'ended') {
      throw new ConflictException('Ended service agreements cannot be edited.');
    }

    const merged = mergeAgreementMutation(existing, request);
    const normalized = await this.validateAgreementMutation(merged);
    return {
      agreement: await this.serviceAgreementsRepository.updateAgreement(
        agreementId,
        normalized,
        actor
      )
    };
  }

  async activateAgreement(
    sessionToken: string,
    agreementId: string,
    request: ServiceAgreementStatusChangeRequestDto
  ): Promise<ServiceAgreementResponseDto> {
    return this.changeStatus(sessionToken, agreementId, 'active', ['draft', 'paused'], request);
  }

  async pauseAgreement(
    sessionToken: string,
    agreementId: string,
    request: ServiceAgreementStatusChangeRequestDto
  ): Promise<ServiceAgreementResponseDto> {
    return this.changeStatus(sessionToken, agreementId, 'paused', ['active'], request);
  }

  async endAgreement(
    sessionToken: string,
    agreementId: string,
    request: ServiceAgreementStatusChangeRequestDto
  ): Promise<ServiceAgreementResponseDto> {
    return this.changeStatus(
      sessionToken,
      agreementId,
      'ended',
      ['draft', 'active', 'paused'],
      request
    );
  }

  private async changeStatus(
    sessionToken: string,
    agreementId: string,
    nextStatus: ServiceAgreementStatusValue,
    allowedStatuses: readonly ServiceAgreementStatusValue[],
    request: ServiceAgreementStatusChangeRequestDto
  ): Promise<ServiceAgreementResponseDto> {
    const actor = await this.authorize(sessionToken, 'agreements:edit');
    const existing = await this.serviceAgreementsRepository.getAgreementById(agreementId);
    if (!existing) {
      throw new NotFoundException('Service agreement not found.');
    }
    if (!allowedStatuses.includes(existing.status)) {
      throw new ConflictException(
        `Service agreement cannot move from ${existing.status} to ${nextStatus}.`
      );
    }

    const changed = await this.serviceAgreementsRepository.changeAgreementStatus(
      agreementId,
      nextStatus,
      allowedStatuses,
      request.occurredAt ?? new Date().toISOString(),
      request.reason,
      actor
    );
    if (!changed) {
      throw new ConflictException(
        'Service agreement status changed before this request completed.'
      );
    }

    return { agreement: (await this.serviceAgreementsRepository.getAgreementById(agreementId))! };
  }

  private async validateAgreementMutation(
    request: CreateServiceAgreementRequestDto
  ): Promise<CreateServiceAgreementRequestDto> {
    const name = request.name.trim();
    if (!name) {
      throw new BadRequestException('Service agreement name is required.');
    }

    await this.referenceDataService.getCustomerById(request.customerId);
    validateDateOrder(request.startDate, request.endDate);
    if ((request.billingCadence ?? 'none') === 'none' && request.nextBillingDate) {
      throw new BadRequestException('Next billing date requires a billing cadence.');
    }
    await this.validateSourceReferences(request);

    const coveredLocationIds = normalizeIds(request.coveredLocationIds, 'Covered location');
    if (coveredLocationIds.length === 0) {
      throw new BadRequestException('At least one covered location is required.');
    }
    for (const locationId of coveredLocationIds) {
      const location = await this.referenceDataService.getLocationById(locationId);
      if (location.customerId !== request.customerId) {
        throw new BadRequestException('Covered locations must belong to the agreement customer.');
      }
    }

    const coveredEquipmentIds = normalizeIds(
      request.coveredEquipmentIds ?? [],
      'Covered equipment'
    );
    const coveredLocationSet = new Set(coveredLocationIds);
    for (const equipmentId of coveredEquipmentIds) {
      const equipment = await this.equipmentDataService.getEquipmentById(equipmentId);
      if (!equipment.locationId || !coveredLocationSet.has(equipment.locationId)) {
        throw new BadRequestException(
          'Covered equipment must belong to one of the covered customer locations.'
        );
      }
    }

    return {
      ...request,
      name,
      billingCadence: request.billingCadence ?? 'none',
      coveredLocationIds,
      coveredEquipmentIds,
      visitTemplates: (request.visitTemplates ?? []).map(validateVisitTemplate)
    };
  }

  private async validateSourceReferences(request: CreateServiceAgreementRequestDto): Promise<void> {
    if (request.sourceCatalogItemId) {
      const kind = await this.serviceAgreementsRepository.getCatalogItemKind(
        request.sourceCatalogItemId
      );
      if (!kind) {
        throw new NotFoundException('Source Catalog item not found.');
      }
      if (kind !== 'agreement') {
        throw new BadRequestException('Source Catalog item must be an agreement item.');
      }
    }

    if (request.sourceCatalogSnapshot) {
      validateCatalogSnapshot(request.sourceCatalogSnapshot);
      if (request.sourceCatalogSnapshot.kind !== 'agreement') {
        throw new BadRequestException('Source Catalog snapshot must be an agreement item.');
      }
    }

    if (request.sourceEstimateId) {
      const estimateExists = await this.serviceAgreementsRepository.estimateExists(
        request.sourceEstimateId
      );
      if (!estimateExists) {
        throw new NotFoundException('Source estimate not found.');
      }
    }

    if (request.sourceEstimateLineItemId) {
      const lineExists = await this.serviceAgreementsRepository.estimateLineExists(
        request.sourceEstimateLineItemId,
        request.sourceEstimateId
      );
      if (!lineExists) {
        throw new NotFoundException('Source estimate line not found.');
      }
    }
  }

  private authorize(
    sessionToken: string,
    permission: 'agreements:view' | 'agreements:create' | 'agreements:edit'
  ) {
    return this.identityAccessService.getAuthorizedEmployee(sessionToken, permission, [
      'office-web'
    ]);
  }
}

function mergeAgreementMutation(
  existing: ServiceAgreementDto,
  request: UpdateServiceAgreementRequestDto
): CreateServiceAgreementRequestDto {
  return {
    customerId: existing.customerId,
    name: request.name ?? existing.name,
    description: pickNullableOptional(request, 'description', existing.description),
    sourceCatalogItemId: pickNullableOptional(
      request,
      'sourceCatalogItemId',
      existing.sourceCatalogItemId
    ),
    sourceCatalogSnapshot: pickNullableOptional(
      request,
      'sourceCatalogSnapshot',
      existing.sourceCatalogSnapshot
    ),
    sourceEstimateId: pickNullableOptional(request, 'sourceEstimateId', existing.sourceEstimateId),
    sourceEstimateLineItemId: pickNullableOptional(
      request,
      'sourceEstimateLineItemId',
      existing.sourceEstimateLineItemId
    ),
    startDate: pickNullableOptional(request, 'startDate', existing.startDate),
    endDate: pickNullableOptional(request, 'endDate', existing.endDate),
    renewalDate: pickNullableOptional(request, 'renewalDate', existing.renewalDate),
    billingCadence: request.billingCadence ?? existing.billingCadence,
    nextBillingDate: pickNullableOptional(request, 'nextBillingDate', existing.nextBillingDate),
    billingAmount: pickNullableOptional(request, 'billingAmount', existing.billingAmount),
    coveredLocationIds:
      request.coveredLocationIds ??
      existing.coveredLocations.map((location) => location.locationId),
    coveredEquipmentIds:
      request.coveredEquipmentIds ??
      existing.coveredEquipment.map((equipment) => equipment.equipmentId),
    visitTemplates: request.visitTemplates ?? existing.visitTemplates.map(toVisitTemplateInput)
  };
}

function pickNullableOptional<T extends object, K extends keyof T, V>(
  object: T,
  key: K,
  fallback: V | undefined
): Exclude<T[K], null | undefined> | V | undefined {
  if (!Object.prototype.hasOwnProperty.call(object, key)) {
    return fallback;
  }
  const value = object[key];
  return value === null || value === undefined
    ? undefined
    : (value as Exclude<T[K], null | undefined>);
}

function toVisitTemplateInput(
  template: ServiceAgreementVisitTemplate
): ServiceAgreementVisitTemplateInputDto {
  return {
    title: template.title,
    frequency: template.frequency,
    intervalMonths: template.intervalMonths,
    preferredMonth: template.preferredMonth,
    preferredDayOfMonth: template.preferredDayOfMonth,
    timeWindowLabel: template.timeWindowLabel,
    jobType: template.jobType,
    category: template.category,
    summary: template.summary,
    estimatedDurationMinutes: template.estimatedDurationMinutes,
    isActive: template.isActive
  };
}

function validateVisitTemplate(
  template: ServiceAgreementVisitTemplateInputDto
): ServiceAgreementVisitTemplateInputDto {
  const title = template.title.trim();
  if (!title) {
    throw new BadRequestException('Visit template title is required.');
  }
  if (template.frequency === 'custom' && !template.intervalMonths) {
    throw new BadRequestException('Custom visit templates require an interval in months.');
  }
  return { ...template, title };
}

function validateDateOrder(startDate: string | undefined, endDate: string | undefined): void {
  if (startDate && endDate && endDate < startDate) {
    throw new BadRequestException('Service agreement end date cannot be before the start date.');
  }
}

function normalizeIds(values: string[], label: string): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new BadRequestException(`${label} id is required.`);
    }
    if (!seen.has(trimmed)) {
      seen.add(trimmed);
      normalized.push(trimmed);
    }
  }
  return normalized;
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
  validateOptionalNumber(candidate.estimatedLaborHours, 'Catalog snapshot estimated labor hours');
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

function toCustomerSummary(customer: CustomerAccountRecord): CustomerAccountSummary {
  return { ...customer, flags: [...customer.flags] };
}

function toLocationSummary(
  location: LocationRecord,
  customerById: Map<string, CustomerAccountRecord>
): LocationSummary {
  return {
    ...location,
    customerName: customerById.get(location.customerId)?.name ?? 'Unknown customer',
    contacts: [],
    alternateBillToCustomerIds: [...location.alternateBillToCustomerIds]
  };
}

function toEquipmentSummary(
  equipment: EquipmentRecord,
  locationById: Map<string, LocationRecord>,
  customerById: Map<string, CustomerAccountRecord>
): EquipmentSummary {
  const location = equipment.locationId ? locationById.get(equipment.locationId) : undefined;
  const customer = location ? customerById.get(location.customerId) : undefined;

  return {
    id: equipment.id,
    locationId: equipment.locationId,
    locationName: location?.name,
    customerName: customer?.name,
    inventoryLocationLabel: equipment.inventoryLocationLabel,
    equipmentType: equipment.equipmentType,
    brand: equipment.brand,
    model: equipment.model,
    serialNumber: equipment.serialNumber,
    filterSizes: [...equipment.filterSizes],
    equipmentLocationDescription: equipment.equipmentLocationDescription,
    installDate: equipment.installDate,
    warrantyStartDate: equipment.warrantyStartDate,
    warrantyEndDate: equipment.warrantyEndDate,
    warrantyProviderNote: equipment.warrantyProviderNote,
    replacesEquipmentId: equipment.replacesEquipmentId,
    replacedByEquipmentId: equipment.replacedByEquipmentId,
    status: equipment.status,
    notes: equipment.notes,
    updatedAt: equipment.updatedAt
  };
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
  if (typeof value !== 'string') {
    throw new BadRequestException(`${label} must be text.`);
  }
  if (value.length > maxLength) {
    throw new BadRequestException(`${label} is too long.`);
  }
}

function validateOptionalNumber(value: unknown, label: string): void {
  if (value === undefined) {
    return;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BadRequestException(`${label} must be a number.`);
  }
}

function validateBoolean(value: unknown, label: string): void {
  if (typeof value !== 'boolean') {
    throw new BadRequestException(`${label} must be true or false.`);
  }
}
