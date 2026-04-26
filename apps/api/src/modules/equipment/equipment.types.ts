import type {
  CreateEquipmentRequest,
  EquipmentDeleteResponse,
  EquipmentDetail,
  EquipmentGroupSummary,
  EquipmentHistoryEntry,
  EquipmentMutationResponse,
  EquipmentLinkedSummary,
  EquipmentSummary,
  EquipmentWorkspaceResponse,
  LinkEquipmentReplacementRequest,
  UpdateEquipmentFieldRequest,
  UpdateEquipmentRequest
} from '@bellfield/contracts';

export type EquipmentLocationSummaryDto = EquipmentWorkspaceResponse['locations'][number];

export type EquipmentSummaryDto = EquipmentSummary;

export type EquipmentDetailDto = EquipmentDetail;

export type EquipmentGroupSummaryDto = EquipmentGroupSummary;

export type EquipmentHistoryEntryDto = EquipmentHistoryEntry;

export type EquipmentLinkedSummaryDto = EquipmentLinkedSummary;

export type EquipmentWorkspaceResponseDto = EquipmentWorkspaceResponse;

export type CreateEquipmentRequestDto = CreateEquipmentRequest;

export type UpdateEquipmentRequestDto = UpdateEquipmentRequest;

export type UpdateEquipmentFieldRequestDto = UpdateEquipmentFieldRequest;

export type LinkEquipmentReplacementRequestDto = LinkEquipmentReplacementRequest;

export type EquipmentMutationResponseDto = EquipmentMutationResponse;

export type EquipmentDeleteResponseDto = EquipmentDeleteResponse;
