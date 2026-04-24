import type {
  AppointmentStatus,
  EquipmentMutationResponse,
  EquipmentStatus,
  FieldAssignedWorkResponse,
  JobMutationResponse,
  SyncResult
} from '@bellfield/contracts';
import { resolveFieldApiBaseUrl } from './api-base-url';

export type {
  AppointmentStatus,
  EquipmentMutationResponse,
  EquipmentStatus,
  FieldAssignedWorkResponse,
  JobMutationResponse,
  SyncResult
};

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
    throw new Error(errorBody?.message ?? 'Request failed.');
  }

  return (await response.json()) as TResponse;
}

export async function getAssignedFieldWork(input: {
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<FieldAssignedWorkResponse> {
  return requestJson<FieldAssignedWorkResponse>('/operations/jobs/field/assigned-work', input);
}

export async function updateFieldAppointmentStatus(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  appointmentId: string;
  status: AppointmentStatus;
  occurredAt?: string;
  baseUpdatedAt?: string;
}) {
  return requestJson<JobMutationResponse>(`/operations/jobs/appointments/${input.appointmentId}/status`, {
    sessionToken: input.sessionToken,
    apiBaseUrl: input.apiBaseUrl,
    method: 'PATCH',
    body: JSON.stringify({
      status: input.status,
      occurredAt: input.occurredAt,
      baseUpdatedAt: input.baseUpdatedAt,
      syncSource: 'field-save-queue'
    })
  });
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

export async function updateFieldEquipment(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  equipmentId: string;
  model?: string;
  serialNumber?: string;
  filterSizes?: string[];
  equipmentLocationDescription?: string;
  installDate?: string;
  status?: EquipmentStatus;
  notes?: string;
  occurredAt?: string;
  baseUpdatedAt?: string;
}) {
  return requestJson<EquipmentMutationResponse>(`/operations/equipment/${input.equipmentId}`, {
    sessionToken: input.sessionToken,
    apiBaseUrl: input.apiBaseUrl,
    method: 'PATCH',
    body: JSON.stringify({
      model: input.model,
      serialNumber: input.serialNumber,
      filterSizes: input.filterSizes,
      equipmentLocationDescription: input.equipmentLocationDescription,
      installDate: input.installDate,
      status: input.status,
      notes: input.notes,
      occurredAt: input.occurredAt,
      baseUpdatedAt: input.baseUpdatedAt,
      syncSource: 'field-save-queue'
    })
  });
}
