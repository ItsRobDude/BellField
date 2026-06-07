export interface CustomerAccountSummary {
  id: string;
  name: string;
  accountType: string;
  billingAddressLine1: string;
  billingCity: string;
  billingState: string;
  billingPostalCode: string;
  phone?: string;
  email?: string;
  fax?: string;
  isActive: boolean;
  flags: string[];
}

export interface ContactSummary {
  id: string;
  displayName: string;
  phone?: string;
  email?: string;
  fax?: string;
  tags: string[];
  isActive: boolean;
}

export interface LocationSummary {
  id: string;
  name: string;
  customerId: string;
  customerName: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  phone?: string;
  email?: string;
  fax?: string;
  isActive: boolean;
  contacts: ContactLink[];
  alternateBillToCustomerIds: string[];
}

export type ContactMethodOwnerKind = 'customer' | 'location' | 'contact';

export type ContactMethodKind = 'phone' | 'email' | 'fax';

export interface ContactMethodSummary {
  id: string;
  ownerKind: ContactMethodOwnerKind;
  ownerId: string;
  kind: ContactMethodKind;
  label: string;
  value: string;
  isPrimary: boolean;
  isActive: boolean;
  endedAt?: string;
}

export interface CustomerLocationListItem {
  id: string;
  name: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  isActive: boolean;
}

export interface LinkedRecordSummary {
  id: string;
  kind: 'customer' | 'location';
  name: string;
  subtitle: string;
}

export interface ContactLink {
  id: string;
  contactId: string;
  displayName: string;
  phone?: string;
  email?: string;
  fax?: string;
  tags: string[];
  isActive: boolean;
  endDate?: string;
  hasOverrides: boolean;
  sharedContact: ContactSummary;
  linkedRecord: LinkedRecordSummary;
}

export interface OwnershipHistoryEntry {
  id: string;
  customerId: string;
  customerName: string;
  startedAt: string;
  endedAt?: string;
  note?: string;
}

export interface DuplicateCandidate {
  id: string;
  kind: 'customer' | 'location';
  title: string;
  subtitle: string;
  matchReasons: string[];
  isActive: boolean;
  hasDoNotServiceFlag: boolean;
}

export interface CustomerDetail extends CustomerAccountSummary {
  contactMethods: ContactMethodSummary[];
  contacts: ContactLink[];
  locations: CustomerLocationListItem[];
}

export interface LocationDetail extends LocationSummary {
  contactMethods: ContactMethodSummary[];
  ownershipHistory: OwnershipHistoryEntry[];
}

export interface ContactDetail extends ContactSummary {
  contactMethods: ContactMethodSummary[];
  linkedRecords: ContactLink[];
}

export interface CrmSearchResult {
  id: string;
  kind: 'customer' | 'location' | 'contact';
  title: string;
  subtitle: string;
  badges: string[];
  phone?: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  customerId?: string;
  customerName?: string;
  isActive: boolean;
}

export interface CrmSearchResponse {
  query: string;
  results: CrmSearchResult[];
}

export interface CrmWorkspaceResponse {
  customers: CustomerAccountSummary[];
  contacts: ContactSummary[];
  locations: CustomerLocationListItem[];
}

export interface CreateCustomerRequest {
  name: string;
  accountType: string;
  billingAddressLine1: string;
  billingCity: string;
  billingState: string;
  billingPostalCode: string;
  phone?: string;
  email?: string;
  fax?: string;
  flags?: string[];
  confirmDuplicate?: boolean;
}

export type UpdateCustomerRequest = Partial<Omit<CreateCustomerRequest, 'confirmDuplicate'>> & {
  isActive?: boolean;
  confirmDuplicate?: boolean;
};

export interface CustomerMutationResponse {
  customer: CustomerDetail;
  duplicateWarnings?: DuplicateCandidate[];
}

export interface CreateLocationRequest {
  customerId: string;
  name: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  phone?: string;
  email?: string;
  fax?: string;
  alternateBillToCustomerIds?: string[];
  confirmDuplicate?: boolean;
  confirmMissingContactInfo?: boolean;
}

export type UpdateLocationRequest = Partial<
  Omit<CreateLocationRequest, 'customerId' | 'confirmDuplicate' | 'confirmMissingContactInfo'>
> & {
  isActive?: boolean;
  confirmDuplicate?: boolean;
  confirmMissingContactInfo?: boolean;
};

export interface ReassignLocationOwnerRequest {
  customerId: string;
  note?: string;
}

export interface LocationMutationResponse {
  location: LocationDetail;
  duplicateWarnings?: DuplicateCandidate[];
}

export interface CreateContactMethodRequest {
  kind: ContactMethodKind;
  label: string;
  value: string;
  isPrimary?: boolean;
}

export interface UpdateContactMethodRequest {
  label?: string;
  value?: string;
  isPrimary?: boolean;
  isActive?: boolean;
}

export interface ContactMethodMutationResponse {
  contactMethod: ContactMethodSummary;
}

export interface CreateContactRequest {
  displayName: string;
  phone?: string;
  email?: string;
  fax?: string;
  tags?: string[];
}

export type ContactUpdateScope = 'global' | 'link';

export interface UpdateContactRequest {
  displayName?: string;
  phone?: string;
  email?: string;
  fax?: string;
  tags?: string[];
  scope: ContactUpdateScope;
  linkId?: string;
}

export interface ContactMutationResponse {
  contact: ContactDetail;
}

export interface LinkContactRequest {
  contactId: string;
  customerId?: string;
  locationId?: string;
  tags?: string[];
}

export interface UpdateContactLinkRequest {
  tags?: string[];
  endDate?: string;
  isActive?: boolean;
}
