import type {
  CreateEquipmentRequest,
  EquipmentMutationResponse,
  EquipmentSummary,
  EquipmentWorkspaceResponse,
  UpdateEquipmentFieldRequest,
  UpdateEquipmentRequest
} from '@bellfield/contracts';

export type EquipmentLocationSummaryDto = EquipmentWorkspaceResponse['locations'][number];

export type EquipmentSummaryDto = EquipmentSummary;

export type EquipmentWorkspaceResponseDto = EquipmentWorkspaceResponse;

export type CreateEquipmentRequestDto = CreateEquipmentRequest;

export type UpdateEquipmentRequestDto = UpdateEquipmentRequest;

export type UpdateEquipmentFieldRequestDto = UpdateEquipmentFieldRequest;

export type EquipmentMutationResponseDto = EquipmentMutationResponse;
