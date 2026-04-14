import { Injectable } from '@nestjs/common';
import { EquipmentDataService } from '../company-data/equipment-data.service';
import { ReferenceDataService } from '../company-data/reference-data.service';
import { IdentityAccessService } from '../identity-access/identity-access.service';
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
    private readonly identityAccessService: IdentityAccessService
  ) {}

  async getWorkspace(sessionToken: string, includeInactive: boolean) {
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'equipment:view');
    const [locations, equipment] = await Promise.all([
      this.referenceDataService.listLocations(),
      this.equipmentDataService.listEquipment(includeInactive)
    ]);

    return {
      locations: await Promise.all(locations.map((location) => this.toLocationSummary(location.id))),
      equipment: await Promise.all(equipment.map((equipmentRecord) => this.toEquipmentSummary(equipmentRecord.id)))
    };
  }

  async createEquipment(sessionToken: string, request: CreateEquipmentRequestDto): Promise<EquipmentSummaryDto> {
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'equipment:create');

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
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'equipment:edit');

    if (request.locationId) {
      await this.referenceDataService.getLocationById(request.locationId);
    }

    const currentRecord = await this.equipmentDataService.getEquipmentById(equipmentId);

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
              status: 'applied'
            }
          }
        : {})
    };
  }

  private async toLocationSummary(locationId: string): Promise<EquipmentLocationSummaryDto> {
    const location = await this.referenceDataService.getLocationById(locationId);
    const customer = await this.referenceDataService.getCustomerById(location.customerId);
    const contacts = await Promise.all(location.contactIds.map((contactId) => this.referenceDataService.getContactById(contactId)));
    const contactNames = contacts.map((contact) => contact.displayName);

    return {
      id: location.id,
      name: location.name,
      customerId: customer.id,
      customerName: customer.name,
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
}
