import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { toTextArray } from '../../database/database-row.utils';
import type {
  ContactLinkRecord,
  ContactRecord,
  CrmSearchRecord,
  CustomerAccountRecord,
  CustomerDuplicateLookupInput,
  LocationDuplicateCandidateRecord,
  LocationDuplicateLookupInput,
  LocationRecord,
  OwnershipHistoryRecord
} from './company-data.types';
import {
  escapeLikePrefix,
  toContactLinkRecord,
  toContactRecord,
  toCrmSearchRecord,
  toCustomerRecord,
  toLocationRecord,
  toOwnershipHistoryRecord,
  type ContactLinkRow,
  type ContactRow,
  type CrmSearchRow,
  type CustomerRow,
  type LocationDuplicateCandidateRow,
  type LocationRow,
  type OwnershipHistoryRow
} from './reference-data-row-mappers';

/**
 * Read models for the reference-data (CRM) repository: customers, contacts, locations, contact
 * links, ownership history, and unified CRM search. Every method here is a non-mutating query;
 * the write paths live in ReferenceDataRepository, which delegates these reads here.
 */
@Injectable()
export class ReferenceReadDataRepository {
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

    return result.rows.map((row) => toCustomerRecord(row));
  }

  async searchCrm(query: string, limit: number): Promise<CrmSearchRecord[]> {
    const textQuery = query.trim().toLowerCase();
    const textLikePrefix = escapeLikePrefix(textQuery);
    const phonePrefix = query.replace(/\D/g, '');

    if (!textQuery && !phonePrefix) {
      return [];
    }

    const result = await this.databaseService.query<CrmSearchRow>(
      `
        with customer_matches as (
          select
            customer.id,
            'customer' as kind,
            customer.name as title,
            concat(customer.billing_address_line1, ', ', customer.billing_city, ', ', customer.billing_state, ' ', customer.billing_postal_code) as subtitle,
            (
              case when customer.is_active then '{}'::text[] else array['Inactive']::text[] end ||
              case
                when exists (
                  select 1
                  from unnest(customer.flags) flag
                  where lower(flag) like '%do not service%'
                )
                then array['DNU']::text[]
                else '{}'::text[]
              end
            ) as badges,
            customer.phone,
            customer.billing_address_line1 as "addressLine1",
            customer.billing_city as city,
            customer.billing_state as state,
            customer.billing_postal_code as "postalCode",
            null::text as "customerId",
            null::text as "customerName",
            customer.is_active as "isActive",
            (
              case when lower(customer.name) = $1 then 100 when lower(customer.name) like $2 || '%' escape '\' then 80 else 0 end +
              case when lower(coalesce(customer.email, '')) like $2 || '%' escape '\' then 55 else 0 end +
              case when $3 <> '' and regexp_replace(coalesce(customer.phone, ''), '[^0-9]', '', 'g') like $3 || '%' then 60 else 0 end +
              case when lower(customer.billing_address_line1) like $2 || '%' escape '\' then 35 else 0 end +
              case when lower(customer.billing_city) like $2 || '%' escape '\' then 20 else 0 end +
              case when lower(customer.billing_postal_code) like $2 || '%' escape '\' then 25 else 0 end +
              case
                when exists (
                  select 1
                  from unnest(customer.flags) flag
                  where lower(flag) like $2 || '%' escape '\'
                )
                then 15
                else 0
              end
            ) as score
          from customers customer
          where lower(customer.name) like $2 || '%' escape '\'
             or lower(coalesce(customer.email, '')) like $2 || '%' escape '\'
             or lower(customer.billing_address_line1) like $2 || '%' escape '\'
             or lower(customer.billing_city) like $2 || '%' escape '\'
             or lower(customer.billing_postal_code) like $2 || '%' escape '\'
             or ($3 <> '' and regexp_replace(coalesce(customer.phone, ''), '[^0-9]', '', 'g') like $3 || '%')
             or exists (
               select 1
               from unnest(customer.flags) flag
               where lower(flag) like $2 || '%' escape '\'
             )
        ),
        location_matches as (
          select
            location.id,
            'location' as kind,
            location.name as title,
            concat(location.address_line1, ', ', location.city, ', ', location.state, ' ', location.postal_code) as subtitle,
            case when location.is_active then '{}'::text[] else array['Inactive']::text[] end as badges,
            location.phone,
            location.address_line1 as "addressLine1",
            location.city,
            location.state,
            location.postal_code as "postalCode",
            customer.id as "customerId",
            customer.name as "customerName",
            location.is_active as "isActive",
            (
              case when lower(location.name) = $1 then 95 when lower(location.name) like $2 || '%' escape '\' then 75 else 0 end +
              case when lower(location.address_line1) like $2 || '%' escape '\' then 60 else 0 end +
              case when lower(location.city) like $2 || '%' escape '\' then 25 else 0 end +
              case when lower(location.postal_code) like $2 || '%' escape '\' then 30 else 0 end +
              case when lower(customer.name) like $2 || '%' escape '\' then 45 else 0 end +
              case when lower(coalesce(location.email, '')) like $2 || '%' escape '\' then 35 else 0 end +
              case when $3 <> '' and regexp_replace(coalesce(location.phone, ''), '[^0-9]', '', 'g') like $3 || '%' then 55 else 0 end +
              case
                when exists (
                  select 1
                  from location_contact_links link
                  inner join contacts contact on contact.id = link.contact_id
                  where link.location_id = location.id
                    and link.is_active = true
                    and contact.is_active = true
                    and (
                      lower(contact.display_name) like $2 || '%' escape '\'
                      or lower(coalesce(contact.email, '')) like $2 || '%' escape '\'
                      or ($3 <> '' and regexp_replace(coalesce(link.phone_override, contact.phone, ''), '[^0-9]', '', 'g') like $3 || '%')
                    )
                )
                then 30
                else 0
              end
            ) as score
          from locations location
          inner join customers customer on customer.id = location.customer_id
          where lower(location.name) like $2 || '%' escape '\'
             or lower(location.address_line1) like $2 || '%' escape '\'
             or lower(location.city) like $2 || '%' escape '\'
             or lower(location.postal_code) like $2 || '%' escape '\'
             or lower(customer.name) like $2 || '%' escape '\'
             or lower(coalesce(location.email, '')) like $2 || '%' escape '\'
             or ($3 <> '' and regexp_replace(coalesce(location.phone, ''), '[^0-9]', '', 'g') like $3 || '%')
             or exists (
               select 1
               from location_contact_links link
               inner join contacts contact on contact.id = link.contact_id
               where link.location_id = location.id
                 and link.is_active = true
                 and contact.is_active = true
                 and (
                   lower(contact.display_name) like $2 || '%' escape '\'
                   or lower(coalesce(contact.email, '')) like $2 || '%' escape '\'
                   or ($3 <> '' and regexp_replace(coalesce(link.phone_override, contact.phone, ''), '[^0-9]', '', 'g') like $3 || '%')
                 )
             )
        ),
        contact_matches as (
          select
            contact.id,
            'contact' as kind,
            contact.display_name as title,
            coalesce(nullif(array_to_string(contact.tags, ', '), ''), 'Contact') as subtitle,
            case when contact.is_active then '{}'::text[] else array['Inactive']::text[] end as badges,
            contact.phone,
            null::text as "addressLine1",
            null::text as city,
            null::text as state,
            null::text as "postalCode",
            null::text as "customerId",
            null::text as "customerName",
            contact.is_active as "isActive",
            (
              case when lower(contact.display_name) = $1 then 90 when lower(contact.display_name) like $2 || '%' escape '\' then 70 else 0 end +
              case when lower(coalesce(contact.email, '')) like $2 || '%' escape '\' then 40 else 0 end +
              case when $3 <> '' and regexp_replace(coalesce(contact.phone, ''), '[^0-9]', '', 'g') like $3 || '%' then 55 else 0 end +
              case
                when exists (
                  select 1
                  from unnest(contact.tags) tag
                  where lower(tag) like $2 || '%' escape '\'
                )
                then 20
                else 0
              end
            ) as score
          from contacts contact
          where lower(contact.display_name) like $2 || '%' escape '\'
             or lower(coalesce(contact.email, '')) like $2 || '%' escape '\'
             or ($3 <> '' and regexp_replace(coalesce(contact.phone, ''), '[^0-9]', '', 'g') like $3 || '%')
             or exists (
               select 1
               from unnest(contact.tags) tag
               where lower(tag) like $2 || '%' escape '\'
             )
        )
        select *
        from (
          select * from customer_matches
          union all
          select * from location_matches
          union all
          select * from contact_matches
        ) matches
        where score > 0
        order by score desc, title asc, id asc
        limit $4
      `,
      [textQuery, textLikePrefix, phonePrefix, limit]
    );

    return result.rows.map((row) => toCrmSearchRecord(row));
  }

  async findCustomerDuplicateCandidates(
    input: CustomerDuplicateLookupInput
  ): Promise<CustomerAccountRecord[]> {
    if (!input.normalizedName && !input.normalizedPhone && !input.normalizedAddress) {
      return [];
    }

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
        where ($4::text is null or id <> $4)
          and (
            ($1::text <> '' and regexp_replace(lower(name), '[^a-z0-9]', '', 'g') = $1)
            or ($2::text <> '' and regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = $2)
            or (
              $3::text <> ''
              and regexp_replace(
                lower(concat_ws(' ', billing_address_line1, billing_city, billing_state, billing_postal_code)),
                '[^a-z0-9]',
                '',
                'g'
              ) = $3
            )
          )
        order by is_active desc, name asc, id asc
        limit $5
      `,
      [
        input.normalizedName,
        input.normalizedPhone,
        input.normalizedAddress,
        input.excludedCustomerId ?? null,
        input.limit
      ]
    );

    return result.rows.map((row) => toCustomerRecord(row));
  }

  async findLocationDuplicateCandidates(
    input: LocationDuplicateLookupInput
  ): Promise<LocationDuplicateCandidateRecord[]> {
    if (!input.normalizedName && !input.normalizedPhone && !input.normalizedAddress) {
      return [];
    }

    const result = await this.databaseService.query<LocationDuplicateCandidateRow>(
      `
        select
          location.id,
          location.name,
          location.customer_id as "customerId",
          location.address_line1 as "addressLine1",
          location.city,
          location.state,
          location.postal_code as "postalCode",
          location.phone,
          location.email,
          location.fax,
          location.is_active as "isActive",
          location.alternate_bill_to_customer_ids as "alternateBillToCustomerIds",
          customer.name as "customerName",
          customer.flags as "customerFlags"
        from locations location
        inner join customers customer on customer.id = location.customer_id
        where ($4::text is null or location.id <> $4)
          and (
            ($1::text <> '' and regexp_replace(lower(location.name), '[^a-z0-9]', '', 'g') = $1)
            or ($2::text <> '' and regexp_replace(coalesce(location.phone, ''), '[^0-9]', '', 'g') = $2)
            or (
              $3::text <> ''
              and regexp_replace(
                lower(concat_ws(' ', location.address_line1, location.city, location.state, location.postal_code)),
                '[^a-z0-9]',
                '',
                'g'
              ) = $3
            )
          )
        order by location.is_active desc, location.name asc, location.id asc
        limit $5
      `,
      [
        input.normalizedName,
        input.normalizedPhone,
        input.normalizedAddress,
        input.excludedLocationId ?? null,
        input.limit
      ]
    );

    return result.rows.map((row) => ({
      ...toLocationRecord(row),
      customerName: row.customerName,
      customerFlags: toTextArray(row.customerFlags)
    }));
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

    return result.rows[0] ? toCustomerRecord(result.rows[0]) : null;
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

    return result.rows.map((row) => toContactRecord(row));
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

    return result.rows[0] ? toContactRecord(result.rows[0]) : null;
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

    return result.rows.map((row) => toLocationRecord(row));
  }

  async listLocationsForCustomer(
    customerId: string,
    includeInactive = true
  ): Promise<LocationRecord[]> {
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

    return result.rows.map((row) => toLocationRecord(row));
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

    return result.rows[0] ? toLocationRecord(result.rows[0]) : null;
  }

  async listCustomerContactLinks(
    customerId: string,
    includeInactive = true
  ): Promise<ContactLinkRecord[]> {
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

    return result.rows.map((row) => toContactLinkRecord(row, customerId, 'customer'));
  }

  async listLocationContactLinks(
    locationId: string,
    includeInactive = true
  ): Promise<ContactLinkRecord[]> {
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

    return result.rows.map((row) => toContactLinkRecord(row, locationId, 'location'));
  }

  async listContactLinksForContact(
    contactId: string,
    includeInactive = true
  ): Promise<ContactLinkRecord[]> {
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
      ...customerLinks.rows.map((row) => toContactLinkRecord(row, row.linkedRecordId, 'customer')),
      ...locationLinks.rows.map((row) => toContactLinkRecord(row, row.linkedRecordId, 'location'))
    ];
  }

  async getContactLinkById(linkId: string): Promise<ContactLinkRecord | null> {
    const customerResult = await this.databaseService.query<
      ContactLinkRow & { linkedRecordId: string }
    >(
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
      return toContactLinkRecord(
        customerResult.rows[0],
        customerResult.rows[0].linkedRecordId,
        'customer'
      );
    }

    const locationResult = await this.databaseService.query<
      ContactLinkRow & { linkedRecordId: string }
    >(
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
      ? toContactLinkRecord(
          locationResult.rows[0],
          locationResult.rows[0].linkedRecordId,
          'location'
        )
      : null;
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

    return result.rows.map((row) => toOwnershipHistoryRecord(row));
  }
}
