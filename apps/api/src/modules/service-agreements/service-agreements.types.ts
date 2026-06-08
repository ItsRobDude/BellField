import type {
  CreateServiceAgreementRequest,
  ServiceAgreementBillingCadence,
  ServiceAgreementReferenceDataResponse,
  ServiceAgreementResponse,
  ServiceAgreementsResponse,
  ServiceAgreementStatus,
  ServiceAgreementStatusChangeRequest,
  ServiceAgreementSummary,
  ServiceAgreementVisitFrequency,
  ServiceAgreementVisitTemplateInput,
  UpdateServiceAgreementRequest
} from '@bellfield/contracts';

export type ServiceAgreementStatusValue = ServiceAgreementStatus;

export const serviceAgreementStatuses = [
  'draft',
  'active',
  'paused',
  'ended'
] as const satisfies readonly ServiceAgreementStatusValue[];

export type ServiceAgreementBillingCadenceValue = ServiceAgreementBillingCadence;

export const serviceAgreementBillingCadences = [
  'none',
  'monthly',
  'quarterly',
  'semiAnnual',
  'annual',
  'custom'
] as const satisfies readonly ServiceAgreementBillingCadenceValue[];

export type ServiceAgreementVisitFrequencyValue = ServiceAgreementVisitFrequency;

export const serviceAgreementVisitFrequencies = [
  'monthly',
  'quarterly',
  'semiAnnual',
  'annual',
  'custom'
] as const satisfies readonly ServiceAgreementVisitFrequencyValue[];

export type ServiceAgreementDto = ServiceAgreementSummary;
export type ServiceAgreementsResponseDto = ServiceAgreementsResponse;
export type ServiceAgreementResponseDto = ServiceAgreementResponse;
export type ServiceAgreementReferenceDataResponseDto = ServiceAgreementReferenceDataResponse;
export type CreateServiceAgreementRequestDto = CreateServiceAgreementRequest;
export type UpdateServiceAgreementRequestDto = UpdateServiceAgreementRequest;
export type ServiceAgreementStatusChangeRequestDto = ServiceAgreementStatusChangeRequest;
export type ServiceAgreementVisitTemplateInputDto = ServiceAgreementVisitTemplateInput;

export type ServiceAgreementActor = {
  id: string;
  displayName: string;
};

export type ServiceAgreementListFilters = {
  customerId?: string;
  locationId?: string;
  status?: ServiceAgreementStatusValue;
};
