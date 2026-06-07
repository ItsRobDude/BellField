import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import type { ContactLinkRecord } from './company-data.types';
import { toContactLinkRecord, type ContactLinkRow } from './reference-data-row-mappers';

@Injectable()
export class ReferenceContactLinksReadRepository {
  constructor(private readonly databaseService: DatabaseService) {}

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
}
