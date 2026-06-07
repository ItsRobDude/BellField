import type {
  ContactMethodMutationResponse,
  CreateContactMethodRequest,
  UpdateContactMethodRequest
} from '@bellfield/contracts';
import { requestJson } from './operations-api-base';

export async function createOfficeCustomerContactMethod(
  input: CreateContactMethodRequest & {
    customerId: string;
    sessionToken: string;
    apiBaseUrl?: string;
  }
): Promise<ContactMethodMutationResponse> {
  const { customerId, sessionToken, apiBaseUrl, ...payload } = input;

  return requestJson<ContactMethodMutationResponse>(
    `/operations/crm/customers/${customerId}/contact-methods`,
    {
      apiBaseUrl,
      sessionToken,
      method: 'POST',
      body: JSON.stringify(payload)
    }
  );
}

export async function createOfficeLocationContactMethod(
  input: CreateContactMethodRequest & {
    locationId: string;
    sessionToken: string;
    apiBaseUrl?: string;
  }
): Promise<ContactMethodMutationResponse> {
  const { locationId, sessionToken, apiBaseUrl, ...payload } = input;

  return requestJson<ContactMethodMutationResponse>(
    `/operations/crm/locations/${locationId}/contact-methods`,
    {
      apiBaseUrl,
      sessionToken,
      method: 'POST',
      body: JSON.stringify(payload)
    }
  );
}

export async function createOfficeContactContactMethod(
  input: CreateContactMethodRequest & {
    contactId: string;
    sessionToken: string;
    apiBaseUrl?: string;
  }
): Promise<ContactMethodMutationResponse> {
  const { contactId, sessionToken, apiBaseUrl, ...payload } = input;

  return requestJson<ContactMethodMutationResponse>(
    `/operations/crm/contacts/${contactId}/contact-methods`,
    {
      apiBaseUrl,
      sessionToken,
      method: 'POST',
      body: JSON.stringify(payload)
    }
  );
}

export async function updateOfficeContactMethod(
  input: UpdateContactMethodRequest & {
    contactMethodId: string;
    sessionToken: string;
    apiBaseUrl?: string;
  }
): Promise<ContactMethodMutationResponse> {
  const { contactMethodId, sessionToken, apiBaseUrl, ...payload } = input;

  return requestJson<ContactMethodMutationResponse>(
    `/operations/crm/contact-methods/${contactMethodId}`,
    {
      apiBaseUrl,
      sessionToken,
      method: 'PATCH',
      body: JSON.stringify(payload)
    }
  );
}
