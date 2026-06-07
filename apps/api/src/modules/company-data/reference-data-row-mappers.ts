import { toIsoString, toOptionalDateString, toTextArray } from '../../database/database-row.utils';
import type {
  ContactLinkRecord,
  ContactMethodRecord,
  ContactRecord,
  CrmSearchRecord,
  CustomerAccountRecord,
  LocationRecord,
  OwnershipHistoryRecord
} from './company-data.types';

// Raw database row shapes, command input shapes, and the pure row->record mappers for the
// reference-data (CRM) repository. No query or transaction logic lives in this file.

export type CustomerRow = {
  id: string;
  name: string;
  accountType: CustomerAccountRecord['accountType'];
  isActive: boolean;
  billingAddressLine1: string;
  billingCity: string;
  billingState: string;
  billingPostalCode: string;
  phone: string | null;
  email: string | null;
  fax: string | null;
  flags: string[] | null;
};

export type ContactRow = {
  id: string;
  displayName: string;
  phone: string | null;
  email: string | null;
  fax: string | null;
  tags: string[] | null;
  isActive: boolean;
};

export type LocationRow = {
  id: string;
  name: string;
  customerId: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  phone: string | null;
  email: string | null;
  fax: string | null;
  isActive: boolean;
  alternateBillToCustomerIds: string[] | null;
};

export type LocationDuplicateCandidateRow = LocationRow & {
  customerName: string;
  customerFlags: string[] | null;
};

export type ContactLinkRow = {
  id: string;
  contactId: string;
  phone: string | null;
  email: string | null;
  fax: string | null;
  tags: string[] | null;
  isActive: boolean;
  endDate: string | Date | null;
};

export type ContactMethodRow = {
  id: string;
  ownerKind: ContactMethodRecord['ownerKind'];
  ownerId: string;
  kind: ContactMethodRecord['kind'];
  label: string | null;
  value: string;
  isPrimary: boolean;
  isActive: boolean;
  endedAt: string | Date | null;
};

export type OwnershipHistoryRow = {
  id: string;
  locationId: string;
  customerId: string;
  startedAt: string | Date;
  endedAt: string | Date | null;
  note: string | null;
};

export type CrmSearchRow = {
  id: string;
  kind: CrmSearchRecord['kind'];
  title: string;
  subtitle: string;
  badges: string[] | null;
  phone: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  customerId: string | null;
  customerName: string | null;
  isActive: boolean;
  score: string | number;
};

export type CreateCustomerInput = Omit<CustomerAccountRecord, 'id'>;
export type UpdateCustomerInput = Partial<Omit<CustomerAccountRecord, 'id'>>;
export type CreateLocationInput = Omit<LocationRecord, 'id'>;
export type UpdateLocationInput = Partial<Omit<LocationRecord, 'id' | 'customerId'>>;
export type CreateContactInput = Omit<ContactRecord, 'id' | 'isActive'> & { isActive?: boolean };
export type UpdateContactInput = Partial<Omit<ContactRecord, 'id'>>;
export type CreateContactLinkInput = Omit<ContactLinkRecord, 'id'>;
export type UpdateContactLinkInput = Partial<
  Omit<ContactLinkRecord, 'id' | 'contactId' | 'linkedRecordId' | 'linkedRecordKind'>
>;
export type CreateContactMethodInput = Omit<ContactMethodRecord, 'id'>;
export type UpdateContactMethodInput = Partial<
  Omit<ContactMethodRecord, 'id' | 'ownerKind' | 'ownerId' | 'kind'>
>;

export function toCustomerRecord(row: CustomerRow): CustomerAccountRecord {
  return {
    id: row.id,
    name: row.name,
    accountType: row.accountType,
    isActive: row.isActive,
    billingAddressLine1: row.billingAddressLine1,
    billingCity: row.billingCity,
    billingState: row.billingState,
    billingPostalCode: row.billingPostalCode,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    fax: row.fax ?? undefined,
    flags: toTextArray(row.flags)
  };
}

export function toCrmSearchRecord(row: CrmSearchRow): CrmSearchRecord {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    subtitle: row.subtitle,
    badges: toTextArray(row.badges),
    phone: row.phone ?? undefined,
    addressLine1: row.addressLine1 ?? undefined,
    city: row.city ?? undefined,
    state: row.state ?? undefined,
    postalCode: row.postalCode ?? undefined,
    customerId: row.customerId ?? undefined,
    customerName: row.customerName ?? undefined,
    isActive: row.isActive,
    score: Number(row.score)
  };
}

export function toContactRecord(row: ContactRow): ContactRecord {
  return {
    id: row.id,
    displayName: row.displayName,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    fax: row.fax ?? undefined,
    tags: toTextArray(row.tags),
    isActive: row.isActive
  };
}

export function toLocationRecord(row: LocationRow): LocationRecord {
  return {
    id: row.id,
    name: row.name,
    customerId: row.customerId,
    addressLine1: row.addressLine1,
    city: row.city,
    state: row.state,
    postalCode: row.postalCode,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    fax: row.fax ?? undefined,
    isActive: row.isActive,
    alternateBillToCustomerIds: toTextArray(row.alternateBillToCustomerIds)
  };
}

export function toContactLinkRecord(
  row: ContactLinkRow,
  linkedRecordId: string,
  linkedRecordKind: ContactLinkRecord['linkedRecordKind']
): ContactLinkRecord {
  return {
    id: row.id,
    contactId: row.contactId,
    linkedRecordId,
    linkedRecordKind,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    fax: row.fax ?? undefined,
    tags: toTextArray(row.tags),
    isActive: row.isActive,
    endDate: toOptionalDateString(row.endDate)
  };
}

export function toContactMethodRecord(row: ContactMethodRow): ContactMethodRecord {
  return {
    id: row.id,
    ownerKind: row.ownerKind,
    ownerId: row.ownerId,
    kind: row.kind,
    label: row.label ?? '',
    value: row.value,
    isPrimary: row.isPrimary,
    isActive: row.isActive,
    endedAt: toOptionalDateString(row.endedAt)
  };
}

export function toOwnershipHistoryRecord(row: OwnershipHistoryRow): OwnershipHistoryRecord {
  return {
    id: row.id,
    locationId: row.locationId,
    customerId: row.customerId,
    startedAt: toIsoString(row.startedAt),
    endedAt: row.endedAt ? toIsoString(row.endedAt) : undefined,
    note: row.note ?? undefined
  };
}

export function nullIfUndefined(value: string | undefined): string | null {
  return value ?? null;
}

export function escapeLikePrefix(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}
