import { Injectable } from '@nestjs/common';
import { EquipmentDataService } from '../company-data/equipment-data.service';
import { ReferenceDataService } from '../company-data/reference-data.service';
import { IdentityAccessService } from '../identity-access/identity-access.service';
import { getAssignedWorkWindow } from '../jobs-appointments/field-work-window';
import { JobsDataService } from '../company-data/jobs-data.service';
import type { AuthorizedEmployee } from '../identity-access/identity-access.types';
import type {
  CreateEquipmentRequestDto,
  EquipmentMutationResponseDto,
  EquipmentLocationSummaryDto,
  EquipmentSummaryDto,
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

  async getWorkspace(sessionToken: string, includeInactive: boolean) {
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'equipment:view', ['office-web']);
    const [locations, equipment] = await Promise.all([
      this.referenceDataService.listLocations(false),
      this.equipmentDataService.listEquipment(includeInactive)
    ]);

    return {
      locations: await Promise.all(locations.map((location) => this.toLocationSummary(location.id))),
      equipment: await Promise.all(equipment.map((equipmentRecord) => this.toEquipmentSummary(equipmentRecord.id)))
    };
  }

  async createEquipment(sessionToken: string, request: CreateEquipmentRequestDto): Promise<EquipmentSummaryDto> {
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'equipment:create', ['office-web']);

    if (request.locationId) {
      await this.referenceDataService.getLocationById(request.locationId);
    }

    const createdEquipment = await this.equipmentDataService.createEquipment(request);
    return this.toEquipmentSummary(createdEquipment.id);
  }

  async updateEquipment(
    sessionToken: string,
    equipmentId: string,
    request: UpdateEquipmentFieldRequestDto
  ): Promise<EquipmentMutationResponseDto> {
    const actor = await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'equipment:edit');

    if (request.locationId) {
      await this.referenceDataService.getLocationById(request.locationId);
    }

    const currentRecord = await this.equipmentDataService.getEquipmentById(equipmentId);
    const accessCheck = await this.evaluateFieldEquipmentAccess(actor, currentRecord.locationId, request);

    if (accessCheck.status === 'rejected') {
      return {
        ...(await this.toEquipmentSummary(equipmentId)),
        syncResult: {
          status: 'rejected',
          message: accessCheck.message
        }
      };
    }

    if (
      request.baseUpdatedAt &&
      currentRecord.updatedAt > request.baseUpdatedAt &&
      ((request.status !== undefined && request.status !== currentRecord.status) ||
        (request.notes !== undefined && request.notes.trim() !== currentRecord.notes))
    ) {
      return {
        ...(await this.toEquipmentSummary(equipmentId)),
        syncResult: {
          status: 'conflict',
          message: 'Equipment changed in BellField before this field update synced.'
        }
      };
    }

    const updatedEquipment = await this.equipmentDataService.updateEquipment(equipmentId, request);

    return {
      ...(await this.toEquipmentSummary(updatedEquipment.id)),
      ...(request.baseUpdatedAt
        ? {
            syncResult: {
              status: 'applied',
              ...(accessCheck.status === 'preservedReplay'
                ? { message: 'Equipment update synced after assignment changed while the device was offline.' }
                : {})
            }
          }
        : {})
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

  private async toEquipmentSummary(equipmentId: string): Promise<EquipmentSummaryDto> {
    const equipmentRecord = await this.equipmentDataService.getEquipmentById(equipmentId);
    const location = equipmentRecord.locationId
      ? await this.referenceDataService.getLocationById(equipmentRecord.locationId)
      : null;
    const customer = location ? await this.referenceDataService.getCustomerById(location.customerId) : null;

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
      status: equipmentRecord.status,
      notes: equipmentRecord.notes,
      updatedAt: equipmentRecord.updatedAt
    };
  }

  private async evaluateFieldEquipmentAccess(
    actor: AuthorizedEmployee,
    locationId: string | undefined,
    replay: UpdateEquipmentFieldRequestDto
  ): Promise<{ status: 'allowed' | 'preservedReplay' | 'rejected'; message?: string }> {
    if (actor.sessionSurface !== 'field-mobile') {
      return { status: 'allowed' };
    }

    if (!locationId) {
      return this.isReplayProvenanceValid(replay)
        ? { status: 'preservedReplay' }
        : {
            status: 'rejected',
            message: 'This equipment change is outside the current assigned-work scope and could not be validated as an offline replay.'
          };
    }

    const { allowedDates } = getAssignedWorkWindow();
    const assignedJobs = await this.jobsDataService.listAssignedJobsForEmployee(actor.id, allowedDates);
    const assignedLocationIds = new Set(assignedJobs.map((job) => job.locationId));

    if (assignedLocationIds.has(locationId)) {
      return { status: 'allowed' };
    }

    if (this.isReplayProvenanceValid(replay)) {
      return { status: 'preservedReplay' };
    }

    return {
      status: 'rejected',
      message: 'This equipment change is outside the current assigned-work scope and could not be validated as an offline replay.'
    };
  }

  private isReplayProvenanceValid(replay: UpdateEquipmentFieldRequestDto): boolean {
    if (replay.syncSource !== 'field-save-queue' || !replay.occurredAt || !replay.baseUpdatedAt) {
      return false;
    }

    return replay.baseUpdatedAt <= replay.occurredAt;
  }
}
