export type EquipmentStatus = 'active' | 'inactive' | 'pendingInstall';

export type AppointmentStatus =
  | 'assigned'
  | 'confirmed'
  | 'onTheWay'
  | 'arrived'
  | 'working'
  | 'finished'
  | 'noAnswer'
  | 'cancelled';

export type FieldAssignedWorkResponse = {
  jobs: {
    id: string;
    jobNumber: string;
    locationId: string;
    locationName: string;
    billToCustomerName: string;
    summary: string;
    status: string;
    appointments: {
      id: string;
      scheduledDate?: string;
      timeWindowLabel?: string;
      technicianName?: string;
      status: AppointmentStatus;
      updatedAt: string;
    }[];
    timeline: {
      id: string;
      occurredAt: string;
      actorName: string;
      message: string;
      kind: string;
    }[];
  }[];
  locations: {
    id: string;
    name: string;
    customerName: string;
    addressLine1: string;
    city: string;
    state: string;
    postalCode: string;
    contacts: {
      id: string;
      displayName: string;
      phone?: string;
      email?: string;
      tags: string[];
    }[];
  }[];
  customers: {
    id: string;
    name: string;
    accountType: string;
    phone?: string;
    email?: string;
    flags: string[];
  }[];
  equipment: {
    id: string;
    locationId?: string;
    equipmentType: string;
    brand: string;
    model: string;
    serialNumber: string;
    filterSizes: string[];
    equipmentLocationDescription?: string;
    status: EquipmentStatus;
    notes: string;
    updatedAt: string;
  }[];
  serverTime: string;
  snapshotVersion: string;
  windowStartDate: string;
  windowEndDate: string;
};

export type SyncResult = {
  status: 'applied' | 'conflict' | 'rejected' | 'retryableFailure';
  message?: string;
};

export type JobMutationResponse = FieldAssignedWorkResponse['jobs'][number] & {
  syncResult?: SyncResult;
  warningMessages?: string[];
};

export type EquipmentMutationResponse = FieldAssignedWorkResponse['equipment'][number] & {
  syncResult?: SyncResult;
};

const defaultApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

async function requestJson<TResponse>(
  path: string,
  options: RequestInit & { apiBaseUrl?: string; sessionToken: string } = { sessionToken: '' }
): Promise<TResponse> {
  const { apiBaseUrl = defaultApiBaseUrl, headers, sessionToken, ...requestOptions } = options;
  const response = await fetch(`${apiBaseUrl}${path}`, {
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
      baseUpdatedAt: input.baseUpdatedAt
    })
  });
}

export async function addFieldJobNote(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  jobId: string;
  note: string;
  occurredAt?: string;
}) {
  return requestJson<JobMutationResponse>(`/operations/jobs/${input.jobId}/notes`, {
    sessionToken: input.sessionToken,
    apiBaseUrl: input.apiBaseUrl,
    method: 'POST',
    body: JSON.stringify({ note: input.note, occurredAt: input.occurredAt })
  });
}

export async function updateFieldEquipment(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  equipmentId: string;
  status?: EquipmentStatus;
  notes?: string;
  baseUpdatedAt?: string;
}) {
  return requestJson<EquipmentMutationResponse>(`/operations/equipment/${input.equipmentId}`, {
    sessionToken: input.sessionToken,
    apiBaseUrl: input.apiBaseUrl,
    method: 'PATCH',
    body: JSON.stringify({
      status: input.status,
      notes: input.notes,
      baseUpdatedAt: input.baseUpdatedAt
    })
  });
}
