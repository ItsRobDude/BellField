import type {
  ContactDetail,
  ContactMutationResponse,
  CreateContactRequest,
  CreateCustomerRequest,
  CreateLocationRequest,
  CrmSearchResponse,
  CrmWorkspaceResponse,
  CustomerDetail,
  CustomerMutationResponse,
  LinkContactRequest,
  LocationDetail,
  LocationMutationResponse,
  ReassignLocationOwnerRequest,
  UpdateContactLinkRequest,
  UpdateContactRequest,
  UpdateCustomerRequest,
  UpdateLocationRequest
} from '@bellfield/contracts';
import { requestJson } from './operations-api-base';

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
  return requestJson<CrmSearchResponse>(
    `/operations/crm/search?q=${encodeURIComponent(input.query)}`,
    {
      apiBaseUrl: input.apiBaseUrl,
      sessionToken: input.sessionToken
    }
  );
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
  input: ReassignLocationOwnerRequest & {
    locationId: string;
    sessionToken: string;
    apiBaseUrl?: string;
  }
): Promise<LocationMutationResponse> {
  const { locationId, sessionToken, apiBaseUrl, ...payload } = input;

  return requestJson<LocationMutationResponse>(
    `/operations/crm/locations/${locationId}/reassign-owner`,
    {
      apiBaseUrl,
      sessionToken,
      method: 'POST',
      body: JSON.stringify(payload)
    }
  );
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
