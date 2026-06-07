import type { ContactUpdateScope } from '@/lib/operations-api';

export type CustomerFormState = {
  name: string;
  accountType: string;
  billingAddressLine1: string;
  billingCity: string;
  billingState: string;
  billingPostalCode: string;
  phone: string;
  email: string;
  fax: string;
  flags: string;
};

export type LocationFormState = {
  customerId: string;
  name: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  phone: string;
  email: string;
  fax: string;
  alternateBillToCustomerIds: string[];
};

export type ContactFormState = {
  displayName: string;
  phone: string;
  email: string;
  fax: string;
  tags: string;
};

export type ContactLinkDraft = {
  phone: string;
  email: string;
  fax: string;
  tags: string;
  scope: ContactUpdateScope;
};

export type CrmPanelMode =
  | 'search'
  | 'newCustomer'
  | 'newLocation'
  | 'newContact'
  | 'customerDetail'
  | 'locationDetail'
  | 'contactDetail';

export type CustomerDetailTab =
  | 'overview'
  | 'locations'
  | 'contacts'
  | 'jobs'
  | 'invoices'
  | 'activity';

export type LocationDetailTab =
  | 'overview'
  | 'contacts'
  | 'equipment'
  | 'jobs'
  | 'invoices'
  | 'activity';
