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

/** A customer or location record the CRM panel can show; the shell gives each one a URL. */
export type CrmRecordRef =
  | { kind: 'customer'; customerId: string }
  | { kind: 'location'; locationId: string };

export type CrmNavigationTarget = CrmRecordRef & {
  /** The job the record was opened from, so the panel's Back can return to it. */
  returnToJobId?: string;
};

export type CrmPanelProps = {
  apiBaseUrl: string;
  sessionToken: string;
  onErrorMessage: (message: string | null) => void;
  canReplaceRemoveEquipment?: boolean;
  canDeleteEquipment?: boolean;
  navigationTarget?: CrmNavigationTarget | null;
  onNavigationTargetConsumed?: () => void;
  /** The user moved to a record (or back to search) inside the panel; null means search. */
  onNavigate?: (record: CrmRecordRef | null) => void;
  onBackToJob?: (jobId: string) => void;
};

export type CustomerDetailTab =
  | 'overview'
  | 'locations'
  | 'contacts'
  | 'agreements'
  | 'jobs'
  | 'invoices'
  | 'activity';

export type LocationDetailTab =
  | 'overview'
  | 'contacts'
  | 'equipment'
  | 'agreements'
  | 'jobs'
  | 'invoices'
  | 'activity';
