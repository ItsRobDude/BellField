import { Injectable } from '@nestjs/common';
import { EquipmentDataService } from '../company-data/equipment-data.service';
import { ReferenceDataService } from '../company-data/reference-data.service';
import { IdentityAccessService } from '../identity-access/identity-access.service';
import type {
  CreateEquipmentRequestDto,
  EquipmentLocationSummaryDto,
  EquipmentSummaryDto,
  UpdateEquipmentRequestDto
} from './equipment.types';

@Injectable()
export class EquipmentService {
  constructor(
    private readonly referenceDataService: ReferenceDataService,
    private readonly equipmentDataService: EquipmentDataService,
    private readonly identityAccessService: IdentityAccessService
  ) {}

  getWorkspace(sessionToken: string, includeInactive: boolean) {
    this.identityAccessService.getAuthorizedEmployee(sessionToken, 'equipment:view');

    return {
      locations: this.referenceDataService.listLocations().map((location) => this.toLocationSummary(location.id)),
      equipment: this.equipmentDataService
        .listEquipment(includeInactive)
        .map((equipmentRecord) => this.toEquipmentSummary(equipmentRecord.id))
    };
  }

  createEquipment(sessionToken: string, request: CreateEquipmentRequestDto): EquipmentSummaryDto {
    this.identityAccessService.getAuthorizedEmployee(sessionToken, 'equipment:create');
    if (request.locationId) {
      this.referenceDataService.getLocationById(request.locationId);
    }

    const createdEquipment = this.equipmentDataService.createEquipment(request);
    return this.toEquipmentSummary(createdEquipment.id);
  }

  updateEquipment(sessionToken: string, equipmentId: string, request: UpdateEquipmentRequestDto): EquipmentSummaryDto {
    this.identityAccessService.getAuthorizedEmployee(sessionToken, 'equipment:edit');
    if (request.locationId) {
      this.referenceDataService.getLocationById(request.locationId);
    }

    const updatedEquipment = this.equipmentDataService.updateEquipment(equipmentId, request);
    return this.toEquipmentSummary(updatedEquipment.id);
  }

  private toLocationSummary(locationId: string): EquipmentLocationSummaryDto {
    const location = this.referenceDataService.getLocationById(locationId);
    const customer = this.referenceDataService.getCustomerById(location.customerId);
    const contactNames = location.contactIds.map((contactId) => this.referenceDataService.getContactById(contactId).displayName);

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

  private toEquipmentSummary(equipmentId: string): EquipmentSummaryDto {
    const equipmentRecord = this.equipmentDataService.getEquipmentById(equipmentId);
    const location = equipmentRecord.locationId ? this.referenceDataService.getLocationById(equipmentRecord.locationId) : null;
    const customer = location ? this.referenceDataService.getCustomerById(location.customerId) : null;

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
