import type {
  CreateServiceAgreementRequest,
  ServiceAgreementResponse,
  ServiceAgreementsResponse,
  ServiceAgreementStatus,
  ServiceAgreementStatusChangeRequest,
  UpdateServiceAgreementRequest
} from '@bellfield/contracts';
import { requestJson } from './operations-api-base';

export type {
  CreateServiceAgreementRequest,
  ServiceAgreementBillingCadence,
  ServiceAgreementCoveredEquipment,
  ServiceAgreementCoveredLocation,
  ServiceAgreementResponse,
  ServiceAgreementsResponse,
  ServiceAgreementStatus,
  ServiceAgreementStatusChangeRequest,
  ServiceAgreementSummary,
  ServiceAgreementVisitFrequency,
  ServiceAgreementVisitTemplate,
  ServiceAgreementVisitTemplateInput,
  UpdateServiceAgreementRequest
} from '@bellfield/contracts';

export async function listOfficeServiceAgreements(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  customerId?: string;
  locationId?: string;
  status?: ServiceAgreementStatus;
}): Promise<ServiceAgreementsResponse> {
  const query = new URLSearchParams();
  if (input.customerId) {
    query.set('customerId', input.customerId);
  }
  if (input.locationId) {
    query.set('locationId', input.locationId);
  }
  if (input.status) {
    query.set('status', input.status);
  }
  const suffix = query.toString();
  return requestJson<ServiceAgreementsResponse>(
    `/operations/service-agreements${suffix ? `?${suffix}` : ''}`,
    {
      apiBaseUrl: input.apiBaseUrl,
      sessionToken: input.sessionToken
    }
  );
}

export async function getOfficeServiceAgreement(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  agreementId: string;
}): Promise<ServiceAgreementResponse> {
  return requestJson<ServiceAgreementResponse>(
    `/operations/service-agreements/${input.agreementId}`,
    {
      apiBaseUrl: input.apiBaseUrl,
      sessionToken: input.sessionToken
    }
  );
}

export async function createOfficeServiceAgreement(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  body: CreateServiceAgreementRequest;
}): Promise<ServiceAgreementResponse> {
  return requestJson<ServiceAgreementResponse>('/operations/service-agreements', {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken,
    method: 'POST',
    body: JSON.stringify(input.body)
  });
}

export async function updateOfficeServiceAgreement(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  agreementId: string;
  body: UpdateServiceAgreementRequest;
}): Promise<ServiceAgreementResponse> {
  return requestJson<ServiceAgreementResponse>(
    `/operations/service-agreements/${input.agreementId}`,
    {
      apiBaseUrl: input.apiBaseUrl,
      sessionToken: input.sessionToken,
      method: 'PUT',
      body: JSON.stringify(input.body)
    }
  );
}

export async function activateOfficeServiceAgreement(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  agreementId: string;
  body?: ServiceAgreementStatusChangeRequest;
}): Promise<ServiceAgreementResponse> {
  return changeOfficeServiceAgreementStatus(input, 'activate');
}

export async function pauseOfficeServiceAgreement(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  agreementId: string;
  body?: ServiceAgreementStatusChangeRequest;
}): Promise<ServiceAgreementResponse> {
  return changeOfficeServiceAgreementStatus(input, 'pause');
}

export async function endOfficeServiceAgreement(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  agreementId: string;
  body?: ServiceAgreementStatusChangeRequest;
}): Promise<ServiceAgreementResponse> {
  return changeOfficeServiceAgreementStatus(input, 'end');
}

function changeOfficeServiceAgreementStatus(
  input: {
    sessionToken: string;
    apiBaseUrl?: string;
    agreementId: string;
    body?: ServiceAgreementStatusChangeRequest;
  },
  action: 'activate' | 'pause' | 'end'
): Promise<ServiceAgreementResponse> {
  return requestJson<ServiceAgreementResponse>(
    `/operations/service-agreements/${input.agreementId}/${action}`,
    {
      apiBaseUrl: input.apiBaseUrl,
      sessionToken: input.sessionToken,
      method: 'POST',
      body: JSON.stringify(input.body ?? {})
    }
  );
}
