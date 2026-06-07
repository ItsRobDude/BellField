import type {
  ContactDetail,
  ContactMethodMutationResponse,
  ContactMutationResponse,
  CreateContactRequest,
  CreateContactMethodRequest,
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
  UpdateContactMethodRequest,
  UpdateContactRequest,
  UpdateCustomerRequest,
  UpdateLocationRequest
} from '@bellfield/contracts';

export type CrmWorkspaceResponseDto = CrmWorkspaceResponse;
export type CrmSearchResponseDto = CrmSearchResponse;
export type CustomerDetailDto = CustomerDetail;
export type LocationDetailDto = LocationDetail;
export type ContactDetailDto = ContactDetail;
export type CreateCustomerRequestDto = CreateCustomerRequest;
export type UpdateCustomerRequestDto = UpdateCustomerRequest;
export type CustomerMutationResponseDto = CustomerMutationResponse;
export type CreateLocationRequestDto = CreateLocationRequest;
export type UpdateLocationRequestDto = UpdateLocationRequest;
export type ReassignLocationOwnerRequestDto = ReassignLocationOwnerRequest;
export type LocationMutationResponseDto = LocationMutationResponse;
export type CreateContactRequestDto = CreateContactRequest;
export type CreateContactMethodRequestDto = CreateContactMethodRequest;
export type UpdateContactRequestDto = UpdateContactRequest;
export type UpdateContactMethodRequestDto = UpdateContactMethodRequest;
export type LinkContactRequestDto = LinkContactRequest;
export type UpdateContactLinkRequestDto = UpdateContactLinkRequest;
export type ContactMutationResponseDto = ContactMutationResponse;
export type ContactMethodMutationResponseDto = ContactMethodMutationResponse;
