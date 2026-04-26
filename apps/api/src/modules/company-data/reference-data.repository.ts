import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService, type QueryExecutor } from '../../database/database.service';
import { toIsoString, toOptionalDateString, toTextArray } from '../../database/database-row.utils';
import type {
  ContactLinkRecord,
  ContactRecord,
  CustomerAccountRecord,
  LocationRecord,
  OwnershipHistoryRecord
} from './company-data.types';

type CustomerRow = {
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

type ContactRow = {
  id: string;
  displayName: string;
  phone: string | null;
  email: string | null;
  fax: string | null;
  tags: string[] | null;
  isActive: boolean;
};

type LocationRow = {
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

type ContactLinkRow = {
  id: string;
  contactId: string;
  phone: string | null;
  email: string | null;
  fax: string | null;
  tags: string[] | null;
  isActive: boolean;
  endDate: string | Date | null;
};

type OwnershipHistoryRow = {
  id: string;
  locationId: string;
  customerId: string;
  startedAt: string | Date;
  endedAt: string | Date | null;
  note: string | null;
};

type CreateCustomerInput = Omit<CustomerAccountRecord, 'id'>;
type UpdateCustomerInput = Partial<Omit<CustomerAccountRecord, 'id'>>;
type CreateLocationInput = Omit<LocationRecord, 'id'>;
type UpdateLocationInput = Partial<Omit<LocationRecord, 'id' | 'customerId'>>;
type CreateContactInput = Omit<ContactRecord, 'id' | 'isActive'> & { isActive?: boolean };
type UpdateContactInput = Partial<Omit<ContactRecord, 'id'>>;
type CreateContactLinkInput = Omit<ContactLinkRecord, 'id'>;
type UpdateContactLinkInput = Partial<Omit<ContactLinkRecord, 'id' | 'contactId' | 'linkedRecordId' | 'linkedRecordKind'>>;

@Injectable()
export class ReferenceDataRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async listCustomers(includeInactive = true): Promise<CustomerAccountRecord[]> {
    const result = await this.databaseService.query<CustomerRow>(
      `
        select
          id,
          name,
          account_type as "accountType",
          is_active as "isActive",
          billing_address_line1 as "billingAddressLine1",
          billing_city as "billingCity",
          billing_state as "billingState",
          billing_postal_code as "billingPostalCode",
          phone,
          email,
          fax,
          flags
        from customers
        ${includeInactive ? '' : 'where is_active = true'}
        order by name asc
      `
    );

    return result.rows.map((row) => this.toCustomerRecord(row));
  }

  async getCustomerById(customerId: string): Promise<CustomerAccountRecord | null> {
    const result = await this.databaseService.query<CustomerRow>(
      `
        select
          id,
          name,
          account_type as "accountType",
          is_active as "isActive",
          billing_address_line1 as "billingAddressLine1",
          billing_city as "billingCity",
          billing_state as "billingState",
          billing_postal_code as "billingPostalCode",
          phone,
          email,
          fax,
          flags
        from customers
        where id = $1
        limit 1
      `,
      [customerId]
    );

    return result.rows[0] ? this.toCustomerRecord(result.rows[0]) : null;
  }

  async createCustomer(input: CreateCustomerInput): Promise<CustomerAccountRecord> {
    const id = randomUUID();
    await this.databaseService.query(
      `
        insert into customers (
          id,
          name,
          account_type,
          is_active,
          billing_address_line1,
          billing_city,
          billing_state,
          billing_postal_code,
          phone,
          email,
          fax,
          flags
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::text[])
      `,
      [
        id,
        input.name,
        input.accountType,
        input.isActive,
        input.billingAddressLine1,
        input.billingCity,
        input.billingState,
        input.billingPostalCode,
        input.phone ?? null,
        input.email ?? null,
        input.fax ?? null,
        input.flags
      ]
    );

    return (await this.getCustomerById(id)) as CustomerAccountRecord;
  }

  async updateCustomer(customerId: string, input: UpdateCustomerInput): Promise<CustomerAccountRecord | null> {
    const current = await this.getCustomerById(customerId);

    if (!current) {
      return null;
    }

    await this.databaseService.query(
      `
        update customers
        set
          name = $2,
          account_type = $3,
          is_active = $4,
          billing_address_line1 = $5,
          billing_city = $6,
          billing_state = $7,
          billing_postal_code = $8,
          phone = $9,
          email = $10,
          fax = $11,
          flags = $12::text[],
          updated_at = now()
        where id = $1
      `,
      [
        customerId,
        input.name ?? current.name,
        input.accountType ?? current.accountType,
        input.isActive ?? current.isActive,
        input.billingAddressLine1 ?? current.billingAddressLine1,
        input.billingCity ?? current.billingCity,
        input.billingState ?? current.billingState,
        input.billingPostalCode ?? current.billingPostalCode,
        input.phone ?? nullIfUndefined(current.phone),
        input.email ?? nullIfUndefined(current.email),
        input.fax ?? nullIfUndefined(current.fax),
        input.flags ?? current.flags
      ]
    );

    return this.getCustomerById(customerId);
  }

  async listContacts(includeInactive = true): Promise<ContactRecord[]> {
    const result = await this.databaseService.query<ContactRow>(
      `
        select
          id,
          display_name as "displayName",
          phone,
          email,
          fax,
          tags,
          is_active as "isActive"
        from contacts
        ${includeInactive ? '' : 'where is_active = true'}
        order by display_name asc
      `
    );

    return result.rows.map((row) => this.toContactRecord(row));
  }

  async getContactById(contactId: string): Promise<ContactRecord | null> {
    const result = await this.databaseService.query<ContactRow>(
      `
        select
          id,
          display_name as "displayName",
          phone,
          email,
          fax,
          tags,
          is_active as "isActive"
        from contacts
        where id = $1
        limit 1
      `,
      [contactId]
    );

    return result.rows[0] ? this.toContactRecord(result.rows[0]) : null;
  }

  async createContact(input: CreateContactInput): Promise<ContactRecord> {
    const id = randomUUID();
    await this.databaseService.query(
      `
        insert into contacts (id, display_name, phone, email, fax, tags, is_active)
        values ($1, $2, $3, $4, $5, $6::text[], $7)
      `,
      [
        id,
        input.displayName,
        input.phone ?? null,
        input.email ?? null,
        input.fax ?? null,
        input.tags,
        input.isActive ?? true
      ]
    );

    return (await this.getContactById(id)) as ContactRecord;
  }

  async updateContact(contactId: string, input: UpdateContactInput): Promise<ContactRecord | null> {
    const current = await this.getContactById(contactId);

    if (!current) {
      return null;
    }

    await this.databaseService.query(
      `
        update contacts
        set
          display_name = $2,
          phone = $3,
          email = $4,
          fax = $5,
          tags = $6::text[],
          is_active = $7,
          updated_at = now()
        where id = $1
      `,
      [
        contactId,
        input.displayName ?? current.displayName,
        input.phone ?? nullIfUndefined(current.phone),
        input.email ?? nullIfUndefined(current.email),
        input.fax ?? nullIfUndefined(current.fax),
        input.tags ?? current.tags,
        input.isActive ?? current.isActive
      ]
    );

    return this.getContactById(contactId);
  }

  async listLocations(includeInactive = true): Promise<LocationRecord[]> {
    const result = await this.databaseService.query<LocationRow>(
      `
        select
          id,
          name,
          customer_id as "customerId",
          address_line1 as "addressLine1",
          city,
          state,
          postal_code as "postalCode",
          phone,
          email,
          fax,
          is_active as "isActive",
          alternate_bill_to_customer_ids as "alternateBillToCustomerIds"
        from locations
        ${includeInactive ? '' : 'where is_active = true'}
        order by name asc
      `
    );

    return result.rows.map((row) => this.toLocationRecord(row));
  }

  async listLocationsForCustomer(customerId: string, includeInactive = true): Promise<LocationRecord[]> {
    const result = await this.databaseService.query<LocationRow>(
      `
        select
          id,
          name,
          customer_id as "customerId",
          address_line1 as "addressLine1",
          city,
          state,
          postal_code as "postalCode",
          phone,
          email,
          fax,
          is_active as "isActive",
          alternate_bill_to_customer_ids as "alternateBillToCustomerIds"
        from locations
        where customer_id = $1
          ${includeInactive ? '' : 'and is_active = true'}
        order by name asc
      `,
      [customerId]
    );

    return result.rows.map((row) => this.toLocationRecord(row));
  }

  async getLocationById(locationId: string): Promise<LocationRecord | null> {
    const result = await this.databaseService.query<LocationRow>(
      `
        select
          id,
          name,
          customer_id as "customerId",
          address_line1 as "addressLine1",
          city,
          state,
          postal_code as "postalCode",
          phone,
          email,
          fax,
          is_active as "isActive",
          alternate_bill_to_customer_ids as "alternateBillToCustomerIds"
        from locations
        where id = $1
        limit 1
      `,
      [locationId]
    );

    return result.rows[0] ? this.toLocationRecord(result.rows[0]) : null;
  }

  async createLocation(input: CreateLocationInput): Promise<LocationRecord> {
    const id = randomUUID();
    await this.databaseService.query(
      `
        insert into locations (
          id,
          name,
          customer_id,
          address_line1,
          city,
          state,
          postal_code,
          phone,
          email,
          fax,
          is_active,
          alternate_bill_to_customer_ids
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::text[])
      `,
      [
        id,
        input.name,
        input.customerId,
        input.addressLine1,
        input.city,
        input.state,
        input.postalCode,
        input.phone ?? null,
        input.email ?? null,
        input.fax ?? null,
        input.isActive,
        input.alternateBillToCustomerIds
      ]
    );

    return (await this.getLocationById(id)) as LocationRecord;
  }

  async updateLocation(locationId: string, input: UpdateLocationInput): Promise<LocationRecord | null> {
    const current = await this.getLocationById(locationId);

    if (!current) {
      return null;
    }

    await this.databaseService.query(
      `
        update locations
        set
          name = $2,
          address_line1 = $3,
          city = $4,
          state = $5,
          postal_code = $6,
          phone = $7,
          email = $8,
          fax = $9,
          is_active = $10,
          alternate_bill_to_customer_ids = $11::text[],
          updated_at = now()
        where id = $1
      `,
      [
        locationId,
        input.name ?? current.name,
        input.addressLine1 ?? current.addressLine1,
        input.city ?? current.city,
        input.state ?? current.state,
        input.postalCode ?? current.postalCode,
        input.phone ?? nullIfUndefined(current.phone),
        input.email ?? nullIfUndefined(current.email),
        input.fax ?? nullIfUndefined(current.fax),
        input.isActive ?? current.isActive,
        input.alternateBillToCustomerIds ?? current.alternateBillToCustomerIds
      ]
    );

    return this.getLocationById(locationId);
  }

  async listCustomerContactLinks(customerId: string, includeInactive = true): Promise<ContactLinkRecord[]> {
    const result = await this.databaseService.query<ContactLinkRow>(
      `
        select
          id,
          contact_id as "contactId",
          phone_override as "phone",
          email_override as "email",
          fax_override as "fax",
          tags,
          is_active as "isActive",
          end_date as "endDate"
        from customer_contact_links
        where customer_id = $1
          ${includeInactive ? '' : 'and is_active = true and end_date is null'}
        order by created_at asc
      `,
      [customerId]
    );

    return result.rows.map((row) => this.toContactLinkRecord(row, customerId, 'customer'));
  }

  async listLocationContactLinks(locationId: string, includeInactive = true): Promise<ContactLinkRecord[]> {
    const result = await this.databaseService.query<ContactLinkRow>(
      `
        select
          id,
          contact_id as "contactId",
          phone_override as "phone",
          email_override as "email",
          fax_override as "fax",
          tags,
          is_active as "isActive",
          end_date as "endDate"
        from location_contact_links
        where location_id = $1
          ${includeInactive ? '' : 'and is_active = true and end_date is null'}
        order by created_at asc
      `,
      [locationId]
    );

    return result.rows.map((row) => this.toContactLinkRecord(row, locationId, 'location'));
  }

  async listContactLinksForContact(contactId: string, includeInactive = true): Promise<ContactLinkRecord[]> {
    const [customerLinks, locationLinks] = await Promise.all([
      this.databaseService.query<ContactLinkRow & { linkedRecordId: string }>(
        `
          select
            id,
            contact_id as "contactId",
            customer_id as "linkedRecordId",
            phone_override as "phone",
            email_override as "email",
            fax_override as "fax",
            tags,
            is_active as "isActive",
            end_date as "endDate"
          from customer_contact_links
          where contact_id = $1
            ${includeInactive ? '' : 'and is_active = true and end_date is null'}
          order by created_at asc
        `,
        [contactId]
      ),
      this.databaseService.query<ContactLinkRow & { linkedRecordId: string }>(
        `
          select
            id,
            contact_id as "contactId",
            location_id as "linkedRecordId",
            phone_override as "phone",
            email_override as "email",
            fax_override as "fax",
            tags,
            is_active as "isActive",
            end_date as "endDate"
          from location_contact_links
          where contact_id = $1
            ${includeInactive ? '' : 'and is_active = true and end_date is null'}
          order by created_at asc
        `,
        [contactId]
      )
    ]);

    return [
      ...customerLinks.rows.map((row) => this.toContactLinkRecord(row, row.linkedRecordId, 'customer')),
      ...locationLinks.rows.map((row) => this.toContactLinkRecord(row, row.linkedRecordId, 'location'))
    ];
  }

  async getContactLinkById(linkId: string): Promise<ContactLinkRecord | null> {
    const customerResult = await this.databaseService.query<ContactLinkRow & { linkedRecordId: string }>(
      `
        select
          id,
          contact_id as "contactId",
          customer_id as "linkedRecordId",
          phone_override as "phone",
          email_override as "email",
          fax_override as "fax",
          tags,
          is_active as "isActive",
          end_date as "endDate"
        from customer_contact_links
        where id = $1
        limit 1
      `,
      [linkId]
    );

    if (customerResult.rows[0]) {
      return this.toContactLinkRecord(customerResult.rows[0], customerResult.rows[0].linkedRecordId, 'customer');
    }

    const locationResult = await this.databaseService.query<ContactLinkRow & { linkedRecordId: string }>(
      `
        select
          id,
          contact_id as "contactId",
          location_id as "linkedRecordId",
          phone_override as "phone",
          email_override as "email",
          fax_override as "fax",
          tags,
          is_active as "isActive",
          end_date as "endDate"
        from location_contact_links
        where id = $1
        limit 1
      `,
      [linkId]
    );

    return locationResult.rows[0]
      ? this.toContactLinkRecord(locationResult.rows[0], locationResult.rows[0].linkedRecordId, 'location')
      : null;
  }

  async createContactLink(input: CreateContactLinkInput): Promise<ContactLinkRecord> {
    const id = randomUUID();
    const tableName = input.linkedRecordKind === 'customer' ? 'customer_contact_links' : 'location_contact_links';
    const idColumn = input.linkedRecordKind === 'customer' ? 'customer_id' : 'location_id';

    await this.databaseService.query(
      `
        insert into ${tableName} (
          id,
          ${idColumn},
          contact_id,
          phone_override,
          email_override,
          fax_override,
          tags,
          is_active,
          end_date
        )
        values ($1, $2, $3, $4, $5, $6, $7::text[], $8, $9)
        on conflict (${idColumn}, contact_id) do update
        set
          phone_override = excluded.phone_override,
          email_override = excluded.email_override,
          fax_override = excluded.fax_override,
          tags = excluded.tags,
          is_active = excluded.is_active,
          end_date = excluded.end_date,
          updated_at = now()
      `,
      [
        id,
        input.linkedRecordId,
        input.contactId,
        input.phone ?? null,
        input.email ?? null,
        input.fax ?? null,
        input.tags,
        input.isActive,
        input.endDate ?? null
      ]
    );

    const existingLink = await this.getContactLinkById(id);
    return existingLink as ContactLinkRecord;
  }

  async updateContactLink(linkId: string, input: UpdateContactLinkInput): Promise<ContactLinkRecord | null> {
    const current = await this.getContactLinkById(linkId);

    if (!current) {
      return null;
    }

    const tableName = current.linkedRecordKind === 'customer' ? 'customer_contact_links' : 'location_contact_links';

    await this.databaseService.query(
      `
        update ${tableName}
        set
          phone_override = $2,
          email_override = $3,
          fax_override = $4,
          tags = $5::text[],
          is_active = $6,
          end_date = $7,
          updated_at = now()
        where id = $1
      `,
      [
        linkId,
        input.phone ?? nullIfUndefined(current.phone),
        input.email ?? nullIfUndefined(current.email),
        input.fax ?? nullIfUndefined(current.fax),
        input.tags ?? current.tags,
        input.isActive ?? current.isActive,
        input.endDate ?? nullIfUndefined(current.endDate)
      ]
    );

    return this.getContactLinkById(linkId);
  }

  async listOwnershipHistory(locationId: string): Promise<OwnershipHistoryRecord[]> {
    const result = await this.databaseService.query<OwnershipHistoryRow>(
      `
        select
          id,
          location_id as "locationId",
          customer_id as "customerId",
          started_at as "startedAt",
          ended_at as "endedAt",
          note
        from location_ownership_history
        where location_id = $1
        order by started_at desc, id desc
      `,
      [locationId]
    );

    return result.rows.map((row) => this.toOwnershipHistoryRecord(row));
  }

  async addOwnershipHistoryEntry(input: Omit<OwnershipHistoryRecord, 'id'>): Promise<OwnershipHistoryRecord> {
    const id = randomUUID();
    await this.databaseService.query(
      `
        insert into location_ownership_history (id, location_id, customer_id, started_at, ended_at, note)
        values ($1, $2, $3, $4, $5, $6)
      `,
      [id, input.locationId, input.customerId, input.startedAt, input.endedAt ?? null, input.note ?? null]
    );

    const [entry] = await this.listOwnershipHistory(input.locationId);
    return entry;
  }

  async reassignLocationOwner(locationId: string, customerId: string, note?: string): Promise<LocationRecord | null> {
    const currentLocation = await this.getLocationById(locationId);

    if (!currentLocation) {
      return null;
    }

    const changedAt = new Date().toISOString();

    await this.databaseService.transaction(async (queryable) => {
      await this.closeActiveOwnershipEntry(locationId, changedAt, queryable);
      await queryable.query(
        `
          update locations
          set customer_id = $2, updated_at = $3
          where id = $1
        `,
        [locationId, customerId, changedAt]
      );
      await queryable.query(
        `
          insert into location_ownership_history (id, location_id, customer_id, started_at, ended_at, note)
          values ($1, $2, $3, $4, null, $5)
        `,
        [randomUUID(), locationId, customerId, changedAt, note ?? null]
      );
    });

    return this.getLocationById(locationId);
  }

  private async closeActiveOwnershipEntry(
    locationId: string,
    endedAt: string,
    queryable: QueryExecutor
  ): Promise<void> {
    await queryable.query(
      `
        update location_ownership_history
        set ended_at = $2
        where location_id = $1
          and ended_at is null
      `,
      [locationId, endedAt]
    );
  }

  private toCustomerRecord(row: CustomerRow): CustomerAccountRecord {
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

  private toContactRecord(row: ContactRow): ContactRecord {
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

  private toLocationRecord(row: LocationRow): LocationRecord {
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

  private toContactLinkRecord(
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

  private toOwnershipHistoryRecord(row: OwnershipHistoryRow): OwnershipHistoryRecord {
    return {
      id: row.id,
      locationId: row.locationId,
      customerId: row.customerId,
      startedAt: toIsoString(row.startedAt),
      endedAt: row.endedAt ? toIsoString(row.endedAt) : undefined,
      note: row.note ?? undefined
    };
  }
}

function nullIfUndefined(value: string | undefined): string | null {
  return value ?? null;
}
