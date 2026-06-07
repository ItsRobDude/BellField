import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import type { ContactMethodRecord } from './company-data.types';
import { toContactMethodRecord, type ContactMethodRow } from './reference-data-row-mappers';

@Injectable()
export class ReferenceContactMethodsReadRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async listCustomerContactMethods(
    customerId: string,
    includeInactive = true
  ): Promise<ContactMethodRecord[]> {
    return this.listContactMethods('customer', customerId, includeInactive);
  }

  async listLocationContactMethods(
    locationId: string,
    includeInactive = true
  ): Promise<ContactMethodRecord[]> {
    return this.listContactMethods('location', locationId, includeInactive);
  }

  async listContactMethodsForContact(
    contactId: string,
    includeInactive = true
  ): Promise<ContactMethodRecord[]> {
    return this.listContactMethods('contact', contactId, includeInactive);
  }

  async getContactMethodById(contactMethodId: string): Promise<ContactMethodRecord | null> {
    const result = await this.databaseService.query<ContactMethodRow>(
      `
        select
          id,
          owner_kind as "ownerKind",
          coalesce(customer_id, location_id, contact_id) as "ownerId",
          kind,
          label,
          value,
          is_primary as "isPrimary",
          is_active as "isActive",
          ended_at as "endedAt"
        from crm_contact_methods
        where id = $1
        limit 1
      `,
      [contactMethodId]
    );

    return result.rows[0] ? toContactMethodRecord(result.rows[0]) : null;
  }

  private async listContactMethods(
    ownerKind: ContactMethodRecord['ownerKind'],
    ownerId: string,
    includeInactive: boolean
  ): Promise<ContactMethodRecord[]> {
    const ownerColumn =
      ownerKind === 'customer'
        ? 'customer_id'
        : ownerKind === 'location'
          ? 'location_id'
          : 'contact_id';
    const result = await this.databaseService.query<ContactMethodRow>(
      `
        select
          id,
          owner_kind as "ownerKind",
          coalesce(customer_id, location_id, contact_id) as "ownerId",
          kind,
          label,
          value,
          is_primary as "isPrimary",
          is_active as "isActive",
          ended_at as "endedAt"
        from crm_contact_methods
        where owner_kind = $1
          and ${ownerColumn} = $2
          ${includeInactive ? '' : 'and is_active = true and ended_at is null'}
        order by
          case kind when 'phone' then 1 when 'email' then 2 else 3 end,
          is_primary desc,
          label asc,
          created_at asc,
          id asc
      `,
      [ownerKind, ownerId]
    );

    return result.rows.map((row) => toContactMethodRecord(row));
  }
}
