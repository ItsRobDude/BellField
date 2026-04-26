import type {
  AppointmentStatus,
  AppointmentSummary,
  ContactDetail,
  ContactLink,
  ContactMutationResponse,
  ContactSummary,
  ContactUpdateScope,
  CreateContactRequest,
  CreateCustomerRequest,
  CreateLocationRequest,
  CrmSearchResponse,
  CrmSearchResult,
  CrmWorkspaceResponse,
  CustomerAccountSummary,
  CustomerDetail,
  CustomerMutationResponse,
  DuplicateCandidate,
  EquipmentStatus,
  EquipmentSummary,
  EquipmentWorkspaceResponse,
  JobStatus,
  JobsWorkspaceResponse,
  JobSummary,
  LinkContactRequest,
  LocationDetail,
  LocationMutationResponse,
  LocationSummary,
  ReassignLocationOwnerRequest,
  UpdateContactLinkRequest,
  UpdateContactRequest,
  UpdateCustomerRequest,
  UpdateLocationRequest,
  UpdateJobStatusResponse
} from '@bellfield/contracts';
import { resolveOfficeApiBaseUrl } from './api-base-url';

export type {
  AppointmentStatus,
  AppointmentSummary,
  ContactDetail,
  ContactLink,
  ContactMutationResponse,
  ContactSummary,
  ContactUpdateScope,
  CreateContactRequest,
  CreateCustomerRequest,
  CreateLocationRequest,
  CrmSearchResponse,
  CrmSearchResult,
  CrmWorkspaceResponse,
  CustomerAccountSummary,
  CustomerDetail,
  CustomerMutationResponse,
  DuplicateCandidate,
  EquipmentStatus,
  EquipmentSummary,
  EquipmentWorkspaceResponse,
  JobStatus,
  JobsWorkspaceResponse,
  JobSummary,
  LinkContactRequest,
  LocationDetail,
  LocationMutationResponse,
  LocationSummary
};

export type JobUpdateResponse = UpdateJobStatusResponse;

async function requestJson<TResponse>(
  path: string,
  options: RequestInit & { apiBaseUrl?: string; sessionToken?: string } = {}
): Promise<TResponse> {
  const { apiBaseUrl, headers, sessionToken, ...requestOptions } = options;
  const resolvedApiBaseUrl = resolveOfficeApiBaseUrl(apiBaseUrl);
  const response = await fetch(`${resolvedApiBaseUrl}${path}`, {
    ...requestOptions,
    headers: {
      'Content-Type': 'application/json',
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      ...headers
    }
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(errorBody?.message ?? 'Request failed.');
  }

  return (await response.json()) as TResponse;
}

export async function getOfficeEquipmentWorkspace(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  includeInactive?: boolean;
}): Promise<EquipmentWorkspaceResponse> {
  const includeInactive = input.includeInactive ? '?includeInactive=true' : '';

  return requestJson<EquipmentWorkspaceResponse>(`/operations/equipment${includeInactive}`, {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken
  });
}

export async function createOfficeEquipment(input: {
  sessionToken: string;
  apiBaseUrl?: string;
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
}): Promise<EquipmentSummary> {
  const { sessionToken, apiBaseUrl, ...payload } = input;

  return requestJson<EquipmentSummary>('/operations/equipment', {
    apiBaseUrl,
    sessionToken,
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateOfficeEquipment(input: {
  equipmentId: string;
  sessionToken: string;
  apiBaseUrl?: string;
  model?: string;
  serialNumber?: string;
  filterSizes?: string[];
  equipmentLocationDescription?: string;
  installDate?: string;
  status?: EquipmentStatus;
  notes?: string;
}): Promise<EquipmentSummary> {
  return requestJson<EquipmentSummary>(`/operations/equipment/${input.equipmentId}`, {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken,
    method: 'PATCH',
    body: JSON.stringify({
      model: input.model,
      serialNumber: input.serialNumber,
      filterSizes: input.filterSizes,
      equipmentLocationDescription: input.equipmentLocationDescription,
      installDate: input.installDate,
      status: input.status,
      notes: input.notes
    })
  });
}

export async function getOfficeJobsWorkspace(input: {
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<JobsWorkspaceResponse> {
  return requestJson<JobsWorkspaceResponse>('/operations/jobs', {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken
  });
}

export async function createOfficeJob(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  locationId: string;
  billToCustomerId?: string;
  jobType: string;
  category: string;
  origin: string;
  summary: string;
  workOrderNumber?: string;
  scheduledDate?: string;
  timeWindowLabel?: string;
  technicianId?: string;
}): Promise<JobSummary> {
  const { sessionToken, apiBaseUrl, ...payload } = input;

  return requestJson<JobSummary>('/operations/jobs', {
    apiBaseUrl,
    sessionToken,
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateOfficeJobStatus(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  jobId: string;
  status: JobStatus;
}): Promise<JobUpdateResponse> {
  return requestJson<JobUpdateResponse>(`/operations/jobs/${input.jobId}/status`, {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken,
    method: 'PATCH',
    body: JSON.stringify({ status: input.status })
  });
}

export async function addOfficeAppointment(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  jobId: string;
  scheduledDate?: string;
  timeWindowLabel?: string;
  technicianId?: string;
}): Promise<JobSummary> {
  return requestJson<JobSummary>(`/operations/jobs/${input.jobId}/appointments`, {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken,
    method: 'POST',
    body: JSON.stringify({
      scheduledDate: input.scheduledDate,
      timeWindowLabel: input.timeWindowLabel,
      technicianId: input.technicianId
    })
  });
}

export async function updateOfficeAppointmentStatus(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  appointmentId: string;
  status: AppointmentStatus;
}): Promise<JobSummary> {
  return requestJson<JobSummary>(`/operations/jobs/appointments/${input.appointmentId}/status`, {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken,
    method: 'PATCH',
    body: JSON.stringify({ status: input.status })
  });
}

export async function getOfficeCrmWorkspace(input: {
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<CrmWorkspaceResponse> {
  return requestJson<CrmWorkspaceResponse>('/operations/crm', {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken
  });
}

export async function searchOfficeCrm(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  query: string;
}): Promise<CrmSearchResponse> {
  return requestJson<CrmSearchResponse>(`/operations/crm/search?q=${encodeURIComponent(input.query)}`, {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken
  });
}

export async function getOfficeCustomerDetail(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  customerId: string;
}): Promise<CustomerDetail> {
  return requestJson<CustomerDetail>(`/operations/crm/customers/${input.customerId}`, {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken
  });
}

export async function createOfficeCustomer(
  input: CreateCustomerRequest & { sessionToken: string; apiBaseUrl?: string }
): Promise<CustomerMutationResponse> {
  const { sessionToken, apiBaseUrl, ...payload } = input;

  return requestJson<CustomerMutationResponse>('/operations/crm/customers', {
    apiBaseUrl,
    sessionToken,
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateOfficeCustomer(
  input: UpdateCustomerRequest & { customerId: string; sessionToken: string; apiBaseUrl?: string }
): Promise<CustomerMutationResponse> {
  const { customerId, sessionToken, apiBaseUrl, ...payload } = input;

  return requestJson<CustomerMutationResponse>(`/operations/crm/customers/${customerId}`, {
    apiBaseUrl,
    sessionToken,
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export async function getOfficeLocationDetail(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  locationId: string;
}): Promise<LocationDetail> {
  return requestJson<LocationDetail>(`/operations/crm/locations/${input.locationId}`, {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken
  });
}

export async function createOfficeLocation(
  input: CreateLocationRequest & { sessionToken: string; apiBaseUrl?: string }
): Promise<LocationMutationResponse> {
  const { sessionToken, apiBaseUrl, ...payload } = input;

  return requestJson<LocationMutationResponse>('/operations/crm/locations', {
    apiBaseUrl,
    sessionToken,
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateOfficeLocation(
  input: UpdateLocationRequest & { locationId: string; sessionToken: string; apiBaseUrl?: string }
): Promise<LocationMutationResponse> {
  const { locationId, sessionToken, apiBaseUrl, ...payload } = input;

  return requestJson<LocationMutationResponse>(`/operations/crm/locations/${locationId}`, {
    apiBaseUrl,
    sessionToken,
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export async function reassignOfficeLocationOwner(
  input: ReassignLocationOwnerRequest & { locationId: string; sessionToken: string; apiBaseUrl?: string }
): Promise<LocationMutationResponse> {
  const { locationId, sessionToken, apiBaseUrl, ...payload } = input;

  return requestJson<LocationMutationResponse>(`/operations/crm/locations/${locationId}/reassign-owner`, {
    apiBaseUrl,
    sessionToken,
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function getOfficeContactDetail(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  contactId: string;
}): Promise<ContactDetail> {
  return requestJson<ContactDetail>(`/operations/crm/contacts/${input.contactId}`, {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken
  });
}

export async function createOfficeContact(
  input: CreateContactRequest & { sessionToken: string; apiBaseUrl?: string }
): Promise<ContactMutationResponse> {
  const { sessionToken, apiBaseUrl, ...payload } = input;

  return requestJson<ContactMutationResponse>('/operations/crm/contacts', {
    apiBaseUrl,
    sessionToken,
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateOfficeContact(
  input: UpdateContactRequest & { contactId: string; sessionToken: string; apiBaseUrl?: string }
): Promise<ContactMutationResponse> {
  const { contactId, sessionToken, apiBaseUrl, ...payload } = input;

  return requestJson<ContactMutationResponse>(`/operations/crm/contacts/${contactId}`, {
    apiBaseUrl,
    sessionToken,
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export async function linkOfficeContact(
  input: LinkContactRequest & { sessionToken: string; apiBaseUrl?: string }
): Promise<ContactMutationResponse> {
  const { sessionToken, apiBaseUrl, ...payload } = input;

  return requestJson<ContactMutationResponse>('/operations/crm/contact-links', {
    apiBaseUrl,
    sessionToken,
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateOfficeContactLink(
  input: UpdateContactLinkRequest & { linkId: string; sessionToken: string; apiBaseUrl?: string }
): Promise<ContactMutationResponse> {
  const { linkId, sessionToken, apiBaseUrl, ...payload } = input;

  return requestJson<ContactMutationResponse>(`/operations/crm/contact-links/${linkId}`, {
    apiBaseUrl,
    sessionToken,
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}
