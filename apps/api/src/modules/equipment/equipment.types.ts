import type { EquipmentStatus } from '../company-data/company-data.types';

export type EquipmentLocationSummaryDto = {
  id: string;
  name: string;
  customerId: string;
  customerName: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  contactNames: string[];
};

export type EquipmentSummaryDto = {
  id: string;
  locationId?: string;
  locationName?: string;
  customerName?: string;
  inventoryLocationLabel?: string;
  equipmentType: string;
  brand: string;
  model: string;
  serialNumber: string;
  filterSizes: string[];
  equipmentLocationDescription?: string;
  installDate?: string;
  status: EquipmentStatus;
  notes: string;
  updatedAt: string;
};

export type EquipmentWorkspaceResponseDto = {
  locations: EquipmentLocationSummaryDto[];
  equipment: EquipmentSummaryDto[];
};

export type CreateEquipmentRequestDto = {
  locationId?: string;
  inventoryLocationLabel?: string;
  equipmentType: string;
  brand: string;
  model: string;
  serialNumber: string;
  filterSizes: string[];
  equipmentLocationDescription?: string;
  installDate?: string;
  status: EquipmentStatus;
  notes?: string;
};

export type UpdateEquipmentRequestDto = Partial<CreateEquipmentRequestDto>;
