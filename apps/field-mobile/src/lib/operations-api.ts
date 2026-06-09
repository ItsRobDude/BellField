import type {
  AppointmentFinishOutcome,
  AppointmentStatus,
  FieldCatalogItem,
  CreateMediaUploadIntentRequest,
  CreateMediaUploadIntentResponse,
  CreateRegisterEntryRequest,
  CreateEquipmentRequest,
  EquipmentMutationResponse,
  EquipmentSummary,
  EquipmentStatus,
  FieldAssignedWorkResponse,
  FieldTruckStockItem,
  FieldTruckStockResponse,
  JobMutationResponse,
  LinkEquipmentReplacementRequest,
  MediaAttachmentKind,
  MediaAttachmentResponse,
  MediaAttachmentsResponse,
  RegisterEntryKind,
  RegisterCatalogSnapshot,
  RegisterEntrySummary,
  SyncResult
} from '@bellfield/contracts';
import { resolveFieldApiBaseUrl } from './api-base-url';

export type {
  AppointmentFinishOutcome,
  AppointmentStatus,
  CreateMediaUploadIntentResponse,
  EquipmentSummary,
  EquipmentMutationResponse,
  EquipmentStatus,
  FieldAssignedWorkResponse,
  FieldCatalogItem,
  FieldTruckStockItem,
  FieldTruckStockResponse,
  JobMutationResponse,
  MediaAttachmentKind,
  MediaAttachmentResponse,
  MediaAttachmentsResponse,
  RegisterEntryKind,
  RegisterEntrySummary,
  RegisterCatalogSnapshot,
  SyncResult
};

export class FieldApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'FieldApiError';
  }
}

export function isFieldApiError(error: unknown): error is FieldApiError {
  return error instanceof FieldApiError;
}

export function isFieldSessionAccessLostError(error: unknown): boolean {
  if (!isFieldApiError(error)) {
    return false;
  }

  if (error.status === 401) {
    return true;
  }

  if (error.status !== 403) {
    return false;
  }

  return /inactive|no longer have permission/i.test(error.message);
}

async function requestJson<TResponse>(
  path: string,
  options: RequestInit & { apiBaseUrl?: string; sessionToken: string } = { sessionToken: '' }
): Promise<TResponse> {
  const { apiBaseUrl, headers, sessionToken, ...requestOptions } = options;
  const resolvedApiBaseUrl = resolveFieldApiBaseUrl(apiBaseUrl);
  const response = await fetch(`${resolvedApiBaseUrl}${path}`, {
    ...requestOptions,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
      ...headers
    }
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new FieldApiError(errorBody?.message ?? 'Request failed.', response.status);
  }

  return (await response.json()) as TResponse;
}

export async function getAssignedFieldWork(input: {
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<FieldAssignedWorkResponse> {
  return requestJson<FieldAssignedWorkResponse>('/operations/jobs/field/assigned-work', input);
}

export async function getFieldTruckStock(input: {
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<FieldTruckStockResponse> {
  return requestJson<FieldTruckStockResponse>('/operations/inventory/field/truck-stock', input);
}

export async function updateFieldAppointmentStatus(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  appointmentId: string;
  status: AppointmentStatus;
  finishOutcome?: AppointmentFinishOutcome;
  visitNotes?: string;
  hasChargeActivity?: boolean;
  registerFollowUpNote?: string;
  occurredAt?: string;
  baseUpdatedAt?: string;
}) {
  return requestJson<JobMutationResponse>(
    `/operations/jobs/appointments/${input.appointmentId}/status`,
    {
      sessionToken: input.sessionToken,
      apiBaseUrl: input.apiBaseUrl,
      method: 'PATCH',
      body: JSON.stringify({
        status: input.status,
        finishOutcome: input.finishOutcome,
        visitNotes: input.visitNotes,
        hasChargeActivity: input.hasChargeActivity,
        registerFollowUpNote: input.registerFollowUpNote,
        occurredAt: input.occurredAt,
        baseUpdatedAt: input.baseUpdatedAt,
        syncSource: 'field-save-queue'
      })
    }
  );
}

export async function addFieldJobNote(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  jobId: string;
  note: string;
  occurredAt?: string;
  baseUpdatedAt?: string;
}) {
  return requestJson<JobMutationResponse>(`/operations/jobs/${input.jobId}/notes`, {
    sessionToken: input.sessionToken,
    apiBaseUrl: input.apiBaseUrl,
    method: 'POST',
    body: JSON.stringify({
      note: input.note,
      occurredAt: input.occurredAt,
      baseUpdatedAt: input.baseUpdatedAt,
      syncSource: 'field-save-queue'
    })
  });
}

export async function createFieldRegisterEntry(
  input: CreateRegisterEntryRequest & {
    sessionToken: string;
    apiBaseUrl?: string;
    jobId: string;
  }
) {
  const { sessionToken, apiBaseUrl, jobId, ...payload } = input;

  return requestJson<JobMutationResponse>(`/operations/jobs/${jobId}/register-entries`, {
    sessionToken,
    apiBaseUrl,
    method: 'POST',
    body: JSON.stringify({
      ...payload,
      syncSource: 'field-save-queue'
    })
  });
}

export async function updateFieldRegisterEntry(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  registerEntryId: string;
  appointmentId?: string | null;
  kind?: RegisterEntryKind;
  description?: string;
  quantity?: number;
  unitOfMeasure?: string;
  unitPrice?: number | null;
  totalAmount?: number;
  partNumber?: string;
  inventorySourceLabel?: string;
  occurredAt?: string;
  baseUpdatedAt?: string;
}) {
  const { sessionToken, apiBaseUrl, registerEntryId, ...payload } = input;

  return requestJson<JobMutationResponse>(`/operations/jobs/register-entries/${registerEntryId}`, {
    sessionToken,
    apiBaseUrl,
    method: 'PATCH',
    body: JSON.stringify({
      ...payload,
      syncSource: 'field-save-queue'
    })
  });
}

export async function voidFieldRegisterEntry(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  registerEntryId: string;
  reason?: string;
  occurredAt?: string;
  baseUpdatedAt?: string;
}) {
  const { sessionToken, apiBaseUrl, registerEntryId, ...payload } = input;

  return requestJson<JobMutationResponse>(
    `/operations/jobs/register-entries/${registerEntryId}/void`,
    {
      sessionToken,
      apiBaseUrl,
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        syncSource: 'field-save-queue'
      })
    }
  );
}

export async function getFieldMediaAttachments(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  jobId: string;
}): Promise<MediaAttachmentsResponse> {
  return requestJson<MediaAttachmentsResponse>(`/operations/jobs/${input.jobId}/media`, {
    sessionToken: input.sessionToken,
    apiBaseUrl: input.apiBaseUrl
  });
}

export async function createFieldMediaUploadIntent(
  input: CreateMediaUploadIntentRequest & {
    sessionToken: string;
    apiBaseUrl?: string;
    jobId: string;
  }
): Promise<CreateMediaUploadIntentResponse> {
  const { sessionToken, apiBaseUrl, jobId, ...payload } = input;

  return requestJson<CreateMediaUploadIntentResponse>(
    `/operations/jobs/${jobId}/media/upload-intents`,
    {
      sessionToken,
      apiBaseUrl,
      method: 'POST',
      body: JSON.stringify(payload)
    }
  );
}

export async function updateFieldMediaAttachment(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  mediaId: string;
  caption?: string | null;
}): Promise<MediaAttachmentResponse> {
  const { sessionToken, apiBaseUrl, mediaId, ...payload } = input;

  return requestJson<MediaAttachmentResponse>(`/operations/media/${mediaId}`, {
    sessionToken,
    apiBaseUrl,
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export async function updateFieldEquipment(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  equipmentId: string;
  locationId?: string;
  inventoryLocationLabel?: string;
  equipmentType?: string;
  brand?: string;
  model?: string;
  serialNumber?: string;
  filterSizes?: string[];
  equipmentLocationDescription?: string;
  installDate?: string;
  warrantyStartDate?: string;
  warrantyEndDate?: string;
  warrantyProviderNote?: string;
  systemGroupName?: string;
  clearSystemGroup?: boolean;
  status?: EquipmentStatus;
  notes?: string;
  occurredAt?: string;
  baseUpdatedAt?: string;
  confirmMissingSerial?: boolean;
}) {
  return requestJson<EquipmentMutationResponse>(`/operations/equipment/${input.equipmentId}`, {
    sessionToken: input.sessionToken,
    apiBaseUrl: input.apiBaseUrl,
    method: 'PATCH',
    body: JSON.stringify({
      locationId: input.locationId,
      inventoryLocationLabel: input.inventoryLocationLabel,
      equipmentType: input.equipmentType,
      brand: input.brand,
      model: input.model,
      serialNumber: input.serialNumber,
      filterSizes: input.filterSizes,
      equipmentLocationDescription: input.equipmentLocationDescription,
      installDate: input.installDate,
      warrantyStartDate: input.warrantyStartDate,
      warrantyEndDate: input.warrantyEndDate,
      warrantyProviderNote: input.warrantyProviderNote,
      systemGroupName: input.systemGroupName,
      clearSystemGroup: input.clearSystemGroup,
      status: input.status,
      notes: input.notes,
      occurredAt: input.occurredAt,
      baseUpdatedAt: input.baseUpdatedAt,
      confirmMissingSerial: input.confirmMissingSerial,
      syncSource: 'field-save-queue'
    })
  });
}

export async function createFieldEquipment(
  input: CreateEquipmentRequest & {
    sessionToken: string;
    apiBaseUrl?: string;
  }
) {
  const { sessionToken, apiBaseUrl, ...payload } = input;

  return requestJson<EquipmentMutationResponse>('/operations/equipment', {
    sessionToken,
    apiBaseUrl,
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function linkFieldEquipmentReplacement(
  input: LinkEquipmentReplacementRequest & {
    equipmentId: string;
    sessionToken: string;
    apiBaseUrl?: string;
  }
) {
  const { equipmentId, sessionToken, apiBaseUrl, ...payload } = input;

  return requestJson<EquipmentMutationResponse>(
    `/operations/equipment/${equipmentId}/replacement-link`,
    {
      sessionToken,
      apiBaseUrl,
      method: 'POST',
      body: JSON.stringify(payload)
    }
  );
}
