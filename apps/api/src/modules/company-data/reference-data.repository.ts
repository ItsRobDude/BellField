import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { toTextArray } from '../../database/database-row.utils';
import type { ContactRecord, CustomerAccountRecord, LocationRecord } from './company-data.types';

type CustomerRow = {
  id: string;
  name: string;
  accountType: CustomerAccountRecord['accountType'];
  isActive: boolean;
  phone: string | null;
  email: string | null;
  flags: string[] | null;
};

type ContactRow = {
  id: string;
  displayName: string;
  phone: string | null;
  email: string | null;
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
  contactIds: string[] | null;
  alternateBillToCustomerIds: string[] | null;
  historyNotes: string[] | null;
};

@Injectable()
export class ReferenceDataRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async listCustomers(): Promise<CustomerAccountRecord[]> {
    const result = await this.databaseService.query<CustomerRow>(
      `
        select
          id,
          name,
          account_type as "accountType",
          is_active as "isActive",
          phone,
          email,
          flags
        from customers
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
          phone,
          email,
          flags
        from customers
        where id = $1
        limit 1
      `,
      [customerId]
    );

    return result.rows[0] ? this.toCustomerRecord(result.rows[0]) : null;
  }

  async listContacts(): Promise<ContactRecord[]> {
    const result = await this.databaseService.query<ContactRow>(
      `
        select
          id,
          display_name as "displayName",
          phone,
          email,
          tags,
          is_active as "isActive"
        from contacts
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

  async listLocations(): Promise<LocationRecord[]> {
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
          contact_ids as "contactIds",
          alternate_bill_to_customer_ids as "alternateBillToCustomerIds",
          history_notes as "historyNotes"
        from locations
        order by name asc
      `
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
          contact_ids as "contactIds",
          alternate_bill_to_customer_ids as "alternateBillToCustomerIds",
          history_notes as "historyNotes"
        from locations
        where id = $1
        limit 1
      `,
      [locationId]
    );

    return result.rows[0] ? this.toLocationRecord(result.rows[0]) : null;
  }

  private toCustomerRecord(row: CustomerRow): CustomerAccountRecord {
    return {
      id: row.id,
      name: row.name,
      accountType: row.accountType,
      isActive: row.isActive,
      phone: row.phone ?? undefined,
      email: row.email ?? undefined,
      flags: toTextArray(row.flags)
    };
  }

  private toContactRecord(row: ContactRow): ContactRecord {
    return {
      id: row.id,
      displayName: row.displayName,
      phone: row.phone ?? undefined,
      email: row.email ?? undefined,
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
      contactIds: toTextArray(row.contactIds),
      alternateBillToCustomerIds: toTextArray(row.alternateBillToCustomerIds),
      historyNotes: toTextArray(row.historyNotes)
    };
  }
}
