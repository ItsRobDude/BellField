import { Injectable } from '@nestjs/common';
import { CompanyDataService } from '../company-data/company-data.service';
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
    private readonly companyDataService: CompanyDataService,
    private readonly identityAccessService: IdentityAccessService
  ) {}

  getWorkspace(sessionToken: string, includeInactive: boolean) {
    this.identityAccessService.getAuthorizedEmployee(sessionToken, 'equipment:view');

    return {
      locations: this.companyDataService.listLocations().map((location) => this.toLocationSummary(location.id)),
      equipment: this.companyDataService
        .listEquipment(includeInactive)
        .map((equipmentRecord) => this.toEquipmentSummary(equipmentRecord.id))
    };
  }

  createEquipment(sessionToken: string, request: CreateEquipmentRequestDto): EquipmentSummaryDto {
    this.identityAccessService.getAuthorizedEmployee(sessionToken, 'equipment:create');
    const createdEquipment = this.companyDataService.createEquipment(request);
    return this.toEquipmentSummary(createdEquipment.id);
  }

  updateEquipment(sessionToken: string, equipmentId: string, request: UpdateEquipmentRequestDto): EquipmentSummaryDto {
    this.identityAccessService.getAuthorizedEmployee(sessionToken, 'equipment:edit');
    const updatedEquipment = this.companyDataService.updateEquipment(equipmentId, request);
    return this.toEquipmentSummary(updatedEquipment.id);
  }

  private toLocationSummary(locationId: string): EquipmentLocationSummaryDto {
    const location = this.companyDataService.getLocationById(locationId);
    const customer = this.companyDataService.getCustomerById(location.customerId);
    const contactNames = location.contactIds.map((contactId) => this.companyDataService.getContactById(contactId).displayName);

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
    const equipmentRecord = this.companyDataService.getEquipmentById(equipmentId);
    const location = equipmentRecord.locationId ? this.companyDataService.getLocationById(equipmentRecord.locationId) : null;
    const customer = location ? this.companyDataService.getCustomerById(location.customerId) : null;

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
