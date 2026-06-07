import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService, type QueryExecutor } from '../../database/database.service';
import type {
  ContactLinkRecord,
  ContactMethodRecord,
  ContactRecord,
  CrmSearchRecord,
  CustomerDuplicateLookupInput,
  CustomerAccountRecord,
  LocationDuplicateCandidateRecord,
  LocationDuplicateLookupInput,
  LocationRecord,
  OwnershipHistoryRecord
} from './company-data.types';
import {
  nullIfUndefined,
  type CreateContactInput,
  type CreateContactLinkInput,
  type CreateContactMethodInput,
  type CreateCustomerInput,
  type CreateLocationInput,
  type UpdateContactInput,
  type UpdateContactLinkInput,
  type UpdateContactMethodInput,
  type UpdateCustomerInput,
  type UpdateLocationInput
} from './reference-data-row-mappers';
import { ReferenceContactLinksReadRepository } from './reference-contact-links-read.repository';
import { ReferenceContactMethodsReadRepository } from './reference-contact-methods-read.repository';
import { ReferenceReadDataRepository } from './reference-read-data.repository';

@Injectable()
export class ReferenceDataRepository {
  constructor(
    private readonly readRepository: ReferenceReadDataRepository,
    private readonly contactLinkReadRepository: ReferenceContactLinksReadRepository,
    private readonly contactMethodReadRepository: ReferenceContactMethodsReadRepository,
    private readonly databaseService: DatabaseService
  ) {}

  async listCustomers(includeInactive = true): Promise<CustomerAccountRecord[]> {
    return this.readRepository.listCustomers(includeInactive);
  }

  async searchCrm(query: string, limit: number): Promise<CrmSearchRecord[]> {
    return this.readRepository.searchCrm(query, limit);
  }

  async findCustomerDuplicateCandidates(
    input: CustomerDuplicateLookupInput
  ): Promise<CustomerAccountRecord[]> {
    return this.readRepository.findCustomerDuplicateCandidates(input);
  }

  async findLocationDuplicateCandidates(
    input: LocationDuplicateLookupInput
  ): Promise<LocationDuplicateCandidateRecord[]> {
    return this.readRepository.findLocationDuplicateCandidates(input);
  }

  async getCustomerById(customerId: string): Promise<CustomerAccountRecord | null> {
    return this.readRepository.getCustomerById(customerId);
  }

  async listContacts(includeInactive = true): Promise<ContactRecord[]> {
    return this.readRepository.listContacts(includeInactive);
  }

  async getContactById(contactId: string): Promise<ContactRecord | null> {
    return this.readRepository.getContactById(contactId);
  }

  async listLocations(includeInactive = true): Promise<LocationRecord[]> {
    return this.readRepository.listLocations(includeInactive);
  }

  async listLocationsForCustomer(
    customerId: string,
    includeInactive = true
  ): Promise<LocationRecord[]> {
    return this.readRepository.listLocationsForCustomer(customerId, includeInactive);
  }

  async getLocationById(locationId: string): Promise<LocationRecord | null> {
    return this.readRepository.getLocationById(locationId);
  }

  async listCustomerContactLinks(
    customerId: string,
    includeInactive = true
  ): Promise<ContactLinkRecord[]> {
    return this.contactLinkReadRepository.listCustomerContactLinks(customerId, includeInactive);
  }

  async listCustomerContactMethods(
    customerId: string,
    includeInactive = true
  ): Promise<ContactMethodRecord[]> {
    return this.contactMethodReadRepository.listCustomerContactMethods(customerId, includeInactive);
  }

  async listLocationContactLinks(
    locationId: string,
    includeInactive = true
  ): Promise<ContactLinkRecord[]> {
    return this.contactLinkReadRepository.listLocationContactLinks(locationId, includeInactive);
  }

  async listLocationContactMethods(
    locationId: string,
    includeInactive = true
  ): Promise<ContactMethodRecord[]> {
    return this.contactMethodReadRepository.listLocationContactMethods(locationId, includeInactive);
  }

  async listContactLinksForContact(
    contactId: string,
    includeInactive = true
  ): Promise<ContactLinkRecord[]> {
    return this.contactLinkReadRepository.listContactLinksForContact(contactId, includeInactive);
  }

  async listContactMethodsForContact(
    contactId: string,
    includeInactive = true
  ): Promise<ContactMethodRecord[]> {
    return this.contactMethodReadRepository.listContactMethodsForContact(
      contactId,
      includeInactive
    );
  }

  async getContactLinkById(linkId: string): Promise<ContactLinkRecord | null> {
    return this.contactLinkReadRepository.getContactLinkById(linkId);
  }

  async getContactMethodById(contactMethodId: string): Promise<ContactMethodRecord | null> {
    return this.contactMethodReadRepository.getContactMethodById(contactMethodId);
  }

  async listOwnershipHistory(locationId: string): Promise<OwnershipHistoryRecord[]> {
    return this.readRepository.listOwnershipHistory(locationId);
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

    return (await this.readRepository.getCustomerById(id)) as CustomerAccountRecord;
  }

  async updateCustomer(
    customerId: string,
    input: UpdateCustomerInput
  ): Promise<CustomerAccountRecord | null> {
    const current = await this.readRepository.getCustomerById(customerId);

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

    return this.readRepository.getCustomerById(customerId);
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

    return (await this.readRepository.getContactById(id)) as ContactRecord;
  }

  async updateContact(contactId: string, input: UpdateContactInput): Promise<ContactRecord | null> {
    const current = await this.readRepository.getContactById(contactId);

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

    return this.readRepository.getContactById(contactId);
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

    return (await this.readRepository.getLocationById(id)) as LocationRecord;
  }

  async updateLocation(
    locationId: string,
    input: UpdateLocationInput
  ): Promise<LocationRecord | null> {
    const current = await this.readRepository.getLocationById(locationId);

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

    return this.readRepository.getLocationById(locationId);
  }

  async createContactLink(input: CreateContactLinkInput): Promise<ContactLinkRecord> {
    const id = randomUUID();
    const tableName =
      input.linkedRecordKind === 'customer' ? 'customer_contact_links' : 'location_contact_links';
    const idColumn = input.linkedRecordKind === 'customer' ? 'customer_id' : 'location_id';

    const result = await this.databaseService.query<{ id: string }>(
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
        returning id
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

    const linkId = result.rows[0]?.id;
    if (!linkId) {
      throw new Error('Contact link upsert did not return an id.');
    }

    const existingLink = await this.contactLinkReadRepository.getContactLinkById(linkId);
    if (!existingLink) {
      throw new Error('Contact link could not be loaded after upsert.');
    }

    return existingLink;
  }

  async updateContactLink(
    linkId: string,
    input: UpdateContactLinkInput
  ): Promise<ContactLinkRecord | null> {
    const current = await this.contactLinkReadRepository.getContactLinkById(linkId);

    if (!current) {
      return null;
    }

    const tableName =
      current.linkedRecordKind === 'customer' ? 'customer_contact_links' : 'location_contact_links';

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

    return this.contactLinkReadRepository.getContactLinkById(linkId);
  }

  async createContactMethod(input: CreateContactMethodInput): Promise<ContactMethodRecord> {
    const id = randomUUID();
    await this.databaseService.transaction(async (queryable) => {
      if (input.isPrimary && input.isActive) {
        await this.clearPrimaryContactMethod(input, queryable);
      }

      await queryable.query(
        `
          insert into crm_contact_methods (
            id,
            owner_kind,
            customer_id,
            location_id,
            contact_id,
            kind,
            label,
            value,
            is_primary,
            is_active,
            ended_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `,
        [
          id,
          input.ownerKind,
          input.ownerKind === 'customer' ? input.ownerId : null,
          input.ownerKind === 'location' ? input.ownerId : null,
          input.ownerKind === 'contact' ? input.ownerId : null,
          input.kind,
          input.label,
          input.value,
          input.isPrimary,
          input.isActive,
          input.endedAt ?? null
        ]
      );
    });

    const method = await this.contactMethodReadRepository.getContactMethodById(id);
    if (!method) {
      throw new Error('Contact method could not be loaded after insert.');
    }

    return method;
  }

  async updateContactMethod(
    contactMethodId: string,
    input: UpdateContactMethodInput
  ): Promise<ContactMethodRecord | null> {
    const current = await this.contactMethodReadRepository.getContactMethodById(contactMethodId);

    if (!current) {
      return null;
    }

    const nextIsActive = input.isActive ?? current.isActive;
    const next: ContactMethodRecord = {
      ...current,
      ...input,
      isActive: nextIsActive,
      endedAt: nextIsActive
        ? undefined
        : (input.endedAt ?? current.endedAt ?? new Date().toISOString().slice(0, 10))
    };

    await this.databaseService.transaction(async (queryable) => {
      if (next.isPrimary && next.isActive) {
        await this.clearPrimaryContactMethod(next, queryable, contactMethodId);
      }

      await queryable.query(
        `
          update crm_contact_methods
          set
            label = $2,
            value = $3,
            is_primary = $4,
            is_active = $5,
            ended_at = $6,
            updated_at = now()
          where id = $1
        `,
        [
          contactMethodId,
          next.label,
          next.value,
          next.isPrimary,
          next.isActive,
          next.endedAt ?? null
        ]
      );
    });

    return this.contactMethodReadRepository.getContactMethodById(contactMethodId);
  }

  async updateLegacyContactValue(
    ownerKind: ContactMethodRecord['ownerKind'],
    ownerId: string,
    kind: ContactMethodRecord['kind'],
    value: string | null
  ): Promise<void> {
    const columnName = kind === 'phone' ? 'phone' : kind === 'email' ? 'email' : 'fax';
    const tableName =
      ownerKind === 'customer' ? 'customers' : ownerKind === 'location' ? 'locations' : 'contacts';

    await this.databaseService.query(
      `
        update ${tableName}
        set ${columnName} = $2, updated_at = now()
        where id = $1
      `,
      [ownerId, value]
    );
  }

  async addOwnershipHistoryEntry(
    input: Omit<OwnershipHistoryRecord, 'id'>
  ): Promise<OwnershipHistoryRecord> {
    const id = randomUUID();
    await this.databaseService.query(
      `
        insert into location_ownership_history (id, location_id, customer_id, started_at, ended_at, note)
        values ($1, $2, $3, $4, $5, $6)
      `,
      [
        id,
        input.locationId,
        input.customerId,
        input.startedAt,
        input.endedAt ?? null,
        input.note ?? null
      ]
    );

    const [entry] = await this.readRepository.listOwnershipHistory(input.locationId);
    return entry;
  }

  private async clearPrimaryContactMethod(
    input: Pick<ContactMethodRecord, 'ownerKind' | 'ownerId' | 'kind'>,
    queryable: QueryExecutor,
    excludedContactMethodId?: string
  ): Promise<void> {
    const ownerColumn =
      input.ownerKind === 'customer'
        ? 'customer_id'
        : input.ownerKind === 'location'
          ? 'location_id'
          : 'contact_id';
    await queryable.query(
      `
        update crm_contact_methods
        set is_primary = false, updated_at = now()
        where owner_kind = $1
          and ${ownerColumn} = $2
          and kind = $3
          and is_primary = true
          and is_active = true
          and ($4::text is null or id <> $4)
      `,
      [input.ownerKind, input.ownerId, input.kind, excludedContactMethodId ?? null]
    );
  }

  async reassignLocationOwner(
    locationId: string,
    customerId: string,
    effectiveDate: string,
    note?: string
  ): Promise<LocationRecord | null> {
    const currentLocation = await this.readRepository.getLocationById(locationId);

    if (!currentLocation) {
      return null;
    }

    const ownershipStartedAt = `${effectiveDate}T00:00:00.000Z`;

    await this.databaseService.transaction(async (queryable) => {
      await this.closeActiveOwnershipEntry(locationId, ownershipStartedAt, queryable);
      await queryable.query(
        `
          update locations
          set customer_id = $2, updated_at = now()
          where id = $1
        `,
        [locationId, customerId]
      );
      await queryable.query(
        `
          insert into location_ownership_history (id, location_id, customer_id, started_at, ended_at, note)
          values ($1, $2, $3, $4, null, $5)
        `,
        [randomUUID(), locationId, customerId, ownershipStartedAt, note ?? null]
      );
    });

    return this.readRepository.getLocationById(locationId);
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
}
