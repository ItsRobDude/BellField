import type { FieldSyncSource, SyncResult } from './jobs.js';

export type EquipmentStatus = 'active' | 'inactive' | 'pendingInstall' | 'removed';

export interface EquipmentGroupSummary {
  id: string;
  name: string;
}

export interface EquipmentLinkedSummary {
  id: string;
  equipmentType: string;
  brand: string;
  model: string;
  serialNumber: string;
  status: EquipmentStatus;
}

export interface EquipmentHistoryEntry {
  id: string;
  occurredAt: string;
  actorName: string;
  kind:
    | 'created'
    | 'edited'
    | 'statusChanged'
    | 'placementChanged'
    | 'grouped'
    | 'ungrouped'
    | 'markedReplaced'
    | 'replacementLinkChanged';
  message: string;
}

export interface EquipmentSummary {
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
  warrantyStartDate?: string;
  warrantyEndDate?: string;
  warrantyProviderNote?: string;
  status: EquipmentStatus;
  ageYears?: number;
  ageLabel?: string;
  systemGroup?: EquipmentGroupSummary;
  replacesEquipmentId?: string;
  replacedByEquipmentId?: string;
  notes: string;
  updatedAt: string;
}

export interface EquipmentDetail extends EquipmentSummary {
  history: EquipmentHistoryEntry[];
  replacesEquipment?: EquipmentLinkedSummary;
  replacedByEquipment?: EquipmentLinkedSummary;
}

export interface EquipmentWorkspaceResponse {
  locations: Array<{
    id: string;
    name: string;
    customerId: string;
    customerName: string;
    addressLine1: string;
    city: string;
    state: string;
    postalCode: string;
    contactNames: string[];
  }>;
  suggestedEquipmentTypes: string[];
  equipment: EquipmentSummary[];
}

export interface CreateEquipmentRequest {
  locationId?: string;
  inventoryLocationLabel?: string;
  equipmentType: string;
  brand: string;
  model: string;
  serialNumber: string;
  filterSizes: string[];
  equipmentLocationDescription?: string;
  installDate?: string;
  warrantyStartDate?: string;
  warrantyEndDate?: string;
  warrantyProviderNote?: string;
  systemGroupName?: string;
  status: EquipmentStatus;
  notes?: string;
  confirmMissingSerial?: boolean;
}

export type UpdateEquipmentRequest = Partial<CreateEquipmentRequest>;

export interface UpdateEquipmentFieldRequest extends UpdateEquipmentRequest {
  occurredAt?: string;
  baseUpdatedAt?: string;
  syncSource?: FieldSyncSource;
}

export interface LinkEquipmentReplacementRequest {
  replacementEquipmentId: string;
}

export interface EquipmentDeleteResponse {
  deletedEquipmentId: string;
}

export interface EquipmentMutationResponse {
  equipment: EquipmentDetail;
  warningMessages?: string[];
  syncResult?: SyncResult;
}
