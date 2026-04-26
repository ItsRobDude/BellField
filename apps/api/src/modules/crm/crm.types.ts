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
export type UpdateContactRequestDto = UpdateContactRequest;
export type LinkContactRequestDto = LinkContactRequest;
export type UpdateContactLinkRequestDto = UpdateContactLinkRequest;
export type ContactMutationResponseDto = ContactMutationResponse;
