import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import type { EquipmentGroupSummary, EquipmentHistoryEntry } from '@bellfield/contracts';
import { EquipmentDataService } from '../company-data/equipment-data.service';
import { ReferenceDataService } from '../company-data/reference-data.service';
import { IdentityAccessService } from '../identity-access/identity-access.service';
import { getAssignedWorkWindow } from '../jobs-appointments/field-work-window';
import { JobsDataService } from '../company-data/jobs-data.service';
import type { AuthorizedEmployee } from '../identity-access/identity-access.types';
import type { EquipmentRecord } from '../company-data/company-data.types';
import type {
  CreateEquipmentRequestDto,
  EquipmentDeleteResponseDto,
  EquipmentDetailDto,
  EquipmentLinkedSummaryDto,
  EquipmentLocationSummaryDto,
  EquipmentMutationResponseDto,
  EquipmentSummaryDto,
  EquipmentWorkspaceResponseDto,
  LinkEquipmentReplacementRequestDto,
  UpdateEquipmentFieldRequestDto
} from './equipment.types';

@Injectable()
export class EquipmentService {
  constructor(
    private readonly referenceDataService: ReferenceDataService,
    private readonly equipmentDataService: EquipmentDataService,
    private readonly jobsDataService: JobsDataService,
    private readonly identityAccessService: IdentityAccessService
  ) {}

  async getWorkspace(
    sessionToken: string,
    includeInactive: boolean
  ): Promise<EquipmentWorkspaceResponseDto> {
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'equipment:view', [
      'office-web'
    ]);
    const [locations, equipment] = await Promise.all([
      this.referenceDataService.listLocations(false),
      this.equipmentDataService.listEquipment(includeInactive)
    ]);

    return {
      locations: await Promise.all(
        locations.map((location) => this.toLocationSummary(location.id))
      ),
      suggestedEquipmentTypes: this.equipmentDataService.getEquipmentTypeSuggestions(),
      equipment: await Promise.all(
        equipment.map((equipmentRecord) => this.toEquipmentSummary(equipmentRecord))
      )
    };
  }

  async getEquipmentDetail(sessionToken: string, equipmentId: string): Promise<EquipmentDetailDto> {
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'equipment:view');
    const equipmentRecord = await this.equipmentDataService.getEquipmentById(equipmentId);
    return this.toEquipmentDetail(equipmentRecord);
  }

  async createEquipment(
    sessionToken: string,
    request: CreateEquipmentRequestDto
  ): Promise<EquipmentMutationResponseDto> {
    const actor = await this.identityAccessService.getAuthorizedEmployee(
      sessionToken,
      'equipment:create'
    );
    await this.validatePlacementInput(
      request.locationId,
      request.inventoryLocationLabel,
      actor.sessionSurface
    );
    await this.validateSerialRequirement(request.serialNumber, request.confirmMissingSerial);
    validateWarrantyDates(request.warrantyStartDate, request.warrantyEndDate);

    if (request.locationId) {
      await this.referenceDataService.getLocationById(request.locationId);
    }

    if (actor.sessionSurface === 'field-mobile') {
      await this.ensureFieldLocationInScope(actor, request.locationId);
    }

    const createdEquipment = await this.equipmentDataService.createEquipment(
      request,
      actor.displayName
    );

    return {
      equipment: await this.toEquipmentDetail(createdEquipment)
    };
  }

  async updateEquipment(
    sessionToken: string,
    equipmentId: string,
    request: UpdateEquipmentFieldRequestDto
  ): Promise<EquipmentMutationResponseDto> {
    const actor = await this.identityAccessService.getAuthorizedEmployee(
      sessionToken,
      'equipment:edit'
    );
    const currentRecord = await this.equipmentDataService.getEquipmentById(equipmentId);

    if (request.locationId || request.inventoryLocationLabel !== undefined) {
      await this.validatePlacementInput(
        request.locationId !== undefined ? request.locationId : currentRecord.locationId,
        request.inventoryLocationLabel !== undefined
          ? request.inventoryLocationLabel
          : currentRecord.inventoryLocationLabel,
        actor.sessionSurface
      );
    }

    if (request.locationId) {
      await this.referenceDataService.getLocationById(request.locationId);
    }

    if (request.status === 'removed') {
      this.ensureReplaceRemovePermission(actor);
    }

    const nextSerialNumber =
      request.serialNumber !== undefined ? request.serialNumber : currentRecord.serialNumber;
    await this.validateSerialRequirement(nextSerialNumber, request.confirmMissingSerial);
    validateWarrantyDates(
      request.warrantyStartDate !== undefined
        ? request.warrantyStartDate
        : currentRecord.warrantyStartDate,
      request.warrantyEndDate !== undefined
        ? request.warrantyEndDate
        : currentRecord.warrantyEndDate
    );

    const accessCheck = await this.evaluateFieldEquipmentAccess(
      actor,
      currentRecord.locationId,
      request.locationId,
      request.inventoryLocationLabel,
      request
    );

    if (accessCheck.status === 'rejected') {
      return {
        equipment: await this.toEquipmentDetail(currentRecord),
        syncResult: {
          status: 'rejected',
          message: accessCheck.message
        }
      };
    }

    if (
      request.baseUpdatedAt &&
      currentRecord.updatedAt > request.baseUpdatedAt &&
      this.hasConflictProneChange(request, currentRecord)
    ) {
      return {
        equipment: await this.toEquipmentDetail(currentRecord),
        syncResult: {
          status: 'conflict',
          message: 'Equipment changed in BellField before this field update synced.'
        }
      };
    }

    const updatedEquipment = await this.equipmentDataService.updateEquipment(
      equipmentId,
      request,
      actor.displayName
    );

    return {
      equipment: await this.toEquipmentDetail(updatedEquipment),
      ...(request.baseUpdatedAt
        ? {
            syncResult: {
              status: 'applied',
              ...(accessCheck.status === 'preservedReplay'
                ? {
                    message:
                      'Equipment update synced after assignment changed while the device was offline.'
                  }
                : {})
            }
          }
        : {})
    };
  }

  async linkEquipmentReplacement(
    sessionToken: string,
    equipmentId: string,
    request: LinkEquipmentReplacementRequestDto
  ): Promise<EquipmentMutationResponseDto> {
    const actor = await this.identityAccessService.getAuthorizedEmployee(
      sessionToken,
      'equipment:edit'
    );
    this.ensureReplaceRemovePermission(actor);

    const oldEquipment = await this.equipmentDataService.getEquipmentById(equipmentId);
    const replacementEquipment = await this.equipmentDataService.getEquipmentById(
      request.replacementEquipmentId
    );

    if (oldEquipment.id === replacementEquipment.id) {
      throw new ConflictException('Equipment cannot replace itself.');
    }

    if (!placementsMatch(oldEquipment, replacementEquipment)) {
      throw new ConflictException(
        'Replacement equipment must stay in the same placement context as the old equipment.'
      );
    }

    if (oldEquipment.status === 'removed') {
      throw new ConflictException('Removed equipment cannot be replaced again.');
    }

    if (oldEquipment.status === 'pendingInstall') {
      throw new ConflictException('Pending install equipment cannot be replaced.');
    }

    if (
      oldEquipment.replacedByEquipmentId &&
      oldEquipment.replacedByEquipmentId !== replacementEquipment.id
    ) {
      throw new ConflictException('This equipment already has a linked replacement.');
    }

    if (replacementEquipment.status !== 'pendingInstall') {
      throw new ConflictException(
        'Replacement equipment must be pending install before it can replace another unit.'
      );
    }

    if (
      replacementEquipment.replacesEquipmentId &&
      replacementEquipment.replacesEquipmentId !== oldEquipment.id
    ) {
      throw new ConflictException(
        'The replacement equipment is already linked to another old unit.'
      );
    }

    if (replacementEquipment.replacedByEquipmentId) {
      throw new ConflictException(
        'Equipment that has already been replaced cannot be used as a replacement.'
      );
    }

    if (actor.sessionSurface === 'field-mobile') {
      await this.ensureFieldLocationInScope(actor, oldEquipment.locationId);
    }

    const replacementResult = await this.equipmentDataService.linkReplacement(
      oldEquipment.id,
      replacementEquipment.id,
      actor.displayName
    );

    return {
      equipment: await this.toEquipmentDetail(replacementResult.oldEquipment)
    };
  }

  async deleteEquipment(
    sessionToken: string,
    equipmentId: string,
    confirmDelete: boolean
  ): Promise<EquipmentDeleteResponseDto> {
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'equipment:delete', [
      'office-web'
    ]);

    if (!confirmDelete) {
      throw new ConflictException('Deleting equipment requires explicit confirmation.');
    }

    await this.equipmentDataService.deleteEquipment(equipmentId);

    return {
      deletedEquipmentId: equipmentId
    };
  }

  private async toLocationSummary(locationId: string): Promise<EquipmentLocationSummaryDto> {
    const location = await this.referenceDataService.getLocationDetail(locationId);
    const contactNames = location.contacts.map((contact) => contact.displayName);

    return {
      id: location.id,
      name: location.name,
      customerId: location.customerId,
      customerName: location.customerName,
      addressLine1: location.addressLine1,
      city: location.city,
      state: location.state,
      postalCode: location.postalCode,
      contactNames
    };
  }

  private async toEquipmentSummary(equipmentRecord: EquipmentRecord): Promise<EquipmentSummaryDto> {
    const location = equipmentRecord.locationId
      ? await this.referenceDataService.getLocationById(equipmentRecord.locationId)
      : null;
    const customer = location
      ? await this.referenceDataService.getCustomerById(location.customerId)
      : null;
    const group = equipmentRecord.systemGroupId
      ? await this.equipmentDataService.getEquipmentGroupById(equipmentRecord.systemGroupId)
      : null;
    const age = deriveEquipmentAge(equipmentRecord.installDate);

    return {
      id: equipmentRecord.id,
      locationId: equipmentRecord.locationId,
      locationName: location?.name,
      customerName: customer?.name,
      inventoryLocationLabel: equipmentRecord.inventoryLocationLabel,
      equipmentType: equipmentRecord.equipmentType,
      brand: equipmentRecord.brand,
      model: equipmentRecord.model,
      serialNumber: equipmentRecord.serialNumber,
      filterSizes: [...equipmentRecord.filterSizes],
      equipmentLocationDescription: equipmentRecord.equipmentLocationDescription,
      installDate: equipmentRecord.installDate,
      warrantyStartDate: equipmentRecord.warrantyStartDate,
      warrantyEndDate: equipmentRecord.warrantyEndDate,
      warrantyProviderNote: equipmentRecord.warrantyProviderNote,
      status: equipmentRecord.status,
      ageYears: age.ageYears,
      ageLabel: age.ageLabel,
      systemGroup: group ? this.toEquipmentGroupSummary(group) : undefined,
      replacesEquipmentId: equipmentRecord.replacesEquipmentId,
      replacedByEquipmentId: equipmentRecord.replacedByEquipmentId,
      notes: equipmentRecord.notes,
      updatedAt: equipmentRecord.updatedAt
    };
  }

  private async toEquipmentDetail(equipmentRecord: EquipmentRecord): Promise<EquipmentDetailDto> {
    const [summary, history, linkedEquipment] = await Promise.all([
      this.toEquipmentSummary(equipmentRecord),
      this.equipmentDataService.getEquipmentHistory(equipmentRecord.id),
      this.equipmentDataService.listEquipmentByIds(
        [equipmentRecord.replacesEquipmentId, equipmentRecord.replacedByEquipmentId].filter(
          Boolean
        ) as string[]
      )
    ]);
    const linkedEquipmentMap = new Map(linkedEquipment.map((record) => [record.id, record]));

    return {
      ...summary,
      history: history.map((entry) => this.toEquipmentHistoryEntry(entry)),
      replacesEquipment: equipmentRecord.replacesEquipmentId
        ? this.toEquipmentLinkedSummary(linkedEquipmentMap.get(equipmentRecord.replacesEquipmentId))
        : undefined,
      replacedByEquipment: equipmentRecord.replacedByEquipmentId
        ? this.toEquipmentLinkedSummary(
            linkedEquipmentMap.get(equipmentRecord.replacedByEquipmentId)
          )
        : undefined
    };
  }

  private toEquipmentGroupSummary(group: { id: string; name: string }): EquipmentGroupSummary {
    return {
      id: group.id,
      name: group.name
    };
  }

  private toEquipmentHistoryEntry(entry: {
    id: string;
    occurredAt: string;
    actorName: string;
    kind: EquipmentHistoryEntry['kind'];
    message: string;
  }): EquipmentHistoryEntry {
    return {
      id: entry.id,
      occurredAt: entry.occurredAt,
      actorName: entry.actorName,
      kind: entry.kind,
      message: entry.message
    };
  }

  private toEquipmentLinkedSummary(
    record: EquipmentRecord | undefined
  ): EquipmentLinkedSummaryDto | undefined {
    if (!record) {
      return undefined;
    }

    return {
      id: record.id,
      equipmentType: record.equipmentType,
      brand: record.brand,
      model: record.model,
      serialNumber: record.serialNumber,
      status: record.status
    };
  }

  private ensureReplaceRemovePermission(actor: AuthorizedEmployee): void {
    if (!actor.effectivePermissions.includes('equipment:configure')) {
      throw new ForbiddenException(
        'Replacing or removing equipment requires additional equipment authority.'
      );
    }
  }

  private async validatePlacementInput(
    locationId: string | undefined,
    inventoryLocationLabel: string | undefined,
    sessionSurface: AuthorizedEmployee['sessionSurface']
  ): Promise<void> {
    const hasLocationId = Boolean(locationId?.trim());
    const hasInventoryLocationLabel = Boolean(inventoryLocationLabel?.trim());

    if (hasLocationId === hasInventoryLocationLabel) {
      throw new ConflictException(
        'Equipment must belong to exactly one placement target: a location or an inventory placement label.'
      );
    }

    if (sessionSurface === 'field-mobile' && hasInventoryLocationLabel) {
      throw new ConflictException(
        'Field equipment creation and edits must stay attached to an assigned customer location.'
      );
    }
  }

  private async validateSerialRequirement(
    serialNumber: string | undefined,
    confirmed = false
  ): Promise<void> {
    if ((serialNumber ?? '').trim().length > 0 || confirmed) {
      return;
    }

    throw new ConflictException(
      'Serial number is strongly recommended. Confirm the blank serial before continuing.'
    );
  }

  private async ensureFieldLocationInScope(
    actor: AuthorizedEmployee,
    locationId: string | undefined
  ): Promise<void> {
    if (!locationId) {
      throw new ConflictException(
        'Field equipment changes must stay attached to an assigned location.'
      );
    }

    const { allowedDates } = getAssignedWorkWindow();
    const assignedJobs = await this.jobsDataService.listAssignedJobsForEmployee(
      actor.id,
      allowedDates
    );
    const assignedLocationIds = new Set(assignedJobs.map((job) => job.locationId));

    if (!assignedLocationIds.has(locationId)) {
      throw new ForbiddenException(
        'This equipment change is outside the current assigned-work scope.'
      );
    }
  }

  private async evaluateFieldEquipmentAccess(
    actor: AuthorizedEmployee,
    currentLocationId: string | undefined,
    nextLocationId: string | undefined,
    nextInventoryLocationLabel: string | undefined,
    replay: UpdateEquipmentFieldRequestDto
  ): Promise<{ status: 'allowed' | 'preservedReplay' | 'rejected'; message?: string }> {
    if (actor.sessionSurface !== 'field-mobile') {
      return { status: 'allowed' };
    }

    if (nextInventoryLocationLabel?.trim()) {
      return {
        status: 'rejected',
        message: 'Field equipment changes must stay attached to an assigned customer location.'
      };
    }

    const targetLocationId = nextLocationId ?? currentLocationId;

    if (!targetLocationId) {
      return this.isReplayProvenanceValid(replay)
        ? { status: 'preservedReplay' }
        : {
            status: 'rejected',
            message:
              'This equipment change is outside the current assigned-work scope and could not be validated as an offline replay.'
          };
    }

    const { allowedDates } = getAssignedWorkWindow();
    const assignedJobs = await this.jobsDataService.listAssignedJobsForEmployee(
      actor.id,
      allowedDates
    );
    const assignedLocationIds = new Set(assignedJobs.map((job) => job.locationId));

    if (assignedLocationIds.has(targetLocationId)) {
      return { status: 'allowed' };
    }

    if (this.isReplayProvenanceValid(replay)) {
      return { status: 'preservedReplay' };
    }

    return {
      status: 'rejected',
      message:
        'This equipment change is outside the current assigned-work scope and could not be validated as an offline replay.'
    };
  }

  private isReplayProvenanceValid(replay: UpdateEquipmentFieldRequestDto): boolean {
    if (replay.syncSource !== 'field-save-queue' || !replay.occurredAt || !replay.baseUpdatedAt) {
      return false;
    }

    return replay.baseUpdatedAt <= replay.occurredAt;
  }

  private hasConflictProneChange(
    request: UpdateEquipmentFieldRequestDto,
    currentRecord: EquipmentRecord
  ): boolean {
    return (
      (request.status !== undefined && request.status !== currentRecord.status) ||
      (request.notes !== undefined && request.notes.trim() !== currentRecord.notes) ||
      (request.model !== undefined && request.model.trim() !== currentRecord.model) ||
      (request.serialNumber !== undefined &&
        request.serialNumber.trim() !== currentRecord.serialNumber)
    );
  }
}

function validateWarrantyDates(warrantyStartDate?: string, warrantyEndDate?: string): void {
  if (warrantyStartDate && warrantyEndDate && warrantyStartDate > warrantyEndDate) {
    throw new ConflictException('Warranty end date must be on or after the warranty start date.');
  }
}

function deriveEquipmentAge(installDate?: string): { ageYears?: number; ageLabel?: string } {
  if (!installDate) {
    return {};
  }

  const installedAt = new Date(`${installDate}T00:00:00.000Z`);

  if (Number.isNaN(installedAt.getTime())) {
    return {};
  }

  const now = new Date();
  let ageYears = now.getUTCFullYear() - installedAt.getUTCFullYear();
  const monthOffset = now.getUTCMonth() - installedAt.getUTCMonth();
  const dayOffset = now.getUTCDate() - installedAt.getUTCDate();

  if (monthOffset < 0 || (monthOffset === 0 && dayOffset < 0)) {
    ageYears -= 1;
  }

  if (ageYears < 0) {
    return {};
  }

  return {
    ageYears,
    ageLabel: ageYears === 0 ? 'Less than 1 year' : ageYears === 1 ? '1 year' : `${ageYears} years`
  };
}

function placementsMatch(left: EquipmentRecord, right: EquipmentRecord): boolean {
  return (
    left.locationId === right.locationId &&
    left.inventoryLocationLabel === right.inventoryLocationLabel
  );
}
