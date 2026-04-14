import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { getApiRuntimeConfig } from '../common/config/runtime-config';
import { seededCustomers, seededContacts, seededEquipment, seededJobs, seededLocations, seededAppointments } from '../modules/company-data/seed-company-data';
import { seededEmployees } from '../modules/identity-access/seed-employees';
import { DatabaseService } from './database.service';

@Injectable()
export class DatabaseBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseBootstrapService.name);
  private readonly runtimeConfig = getApiRuntimeConfig();

  constructor(private readonly databaseService: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    if (!this.runtimeConfig.bootstrapSeedData) {
      this.logger.log('Seed bootstrap disabled for this environment.');
      return;
    }

    await this.seedEmployees();
    await this.seedCustomers();
    await this.seedContacts();
    await this.seedLocations();
    await this.seedEquipment();
    await this.seedJobs();
    await this.seedAppointments();
    await this.seedTimelineEntries();
    await this.alignJobNumberSequence();
  }

  private async seedEmployees(): Promise<void> {
    for (const employee of seededEmployees) {
      await this.databaseService.query(
        `
          insert into employees (
            id,
            email,
            display_name,
            role_id,
            is_active,
            password,
            granted_permissions,
            revoked_permissions
          )
          values ($1, $2, $3, $4, $5, $6, $7::text[], $8::text[])
          on conflict (id) do nothing
        `,
        [
          employee.id,
          employee.email,
          employee.displayName,
          employee.roleId,
          employee.isActive,
          employee.password,
          employee.permissionOverrides.grantedPermissions,
          employee.permissionOverrides.revokedPermissions
        ]
      );
    }
  }

  private async seedCustomers(): Promise<void> {
    for (const customer of seededCustomers) {
      await this.databaseService.query(
        `
          insert into customers (id, name, account_type, is_active, phone, email, flags)
          values ($1, $2, $3, $4, $5, $6, $7::text[])
          on conflict (id) do nothing
        `,
        [customer.id, customer.name, customer.accountType, customer.isActive, customer.phone ?? null, customer.email ?? null, customer.flags]
      );
    }
  }

  private async seedContacts(): Promise<void> {
    for (const contact of seededContacts) {
      await this.databaseService.query(
        `
          insert into contacts (id, display_name, phone, email, tags, is_active)
          values ($1, $2, $3, $4, $5::text[], $6)
          on conflict (id) do nothing
        `,
        [contact.id, contact.displayName, contact.phone ?? null, contact.email ?? null, contact.tags, contact.isActive]
      );
    }
  }

  private async seedLocations(): Promise<void> {
    for (const location of seededLocations) {
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
            contact_ids,
            alternate_bill_to_customer_ids,
            history_notes
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8::text[], $9::text[], $10::text[])
          on conflict (id) do nothing
        `,
        [
          location.id,
          location.name,
          location.customerId,
          location.addressLine1,
          location.city,
          location.state,
          location.postalCode,
          location.contactIds,
          location.alternateBillToCustomerIds,
          location.historyNotes
        ]
      );
    }
  }

  private async seedEquipment(): Promise<void> {
    for (const equipmentRecord of seededEquipment) {
      await this.databaseService.query(
        `
          insert into equipment (
            id,
            location_id,
            inventory_location_label,
            equipment_type,
            brand,
            model,
            serial_number,
            filter_sizes,
            equipment_location_description,
            install_date,
            status,
            notes,
            created_at,
            updated_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8::text[], $9, $10, $11, $12, $13, $14)
          on conflict (id) do nothing
        `,
        [
          equipmentRecord.id,
          equipmentRecord.locationId ?? null,
          equipmentRecord.inventoryLocationLabel ?? null,
          equipmentRecord.equipmentType,
          equipmentRecord.brand,
          equipmentRecord.model,
          equipmentRecord.serialNumber,
          equipmentRecord.filterSizes,
          equipmentRecord.equipmentLocationDescription ?? null,
          equipmentRecord.installDate ?? null,
          equipmentRecord.status,
          equipmentRecord.notes,
          equipmentRecord.createdAt,
          equipmentRecord.updatedAt
        ]
      );
    }
  }

  private async seedJobs(): Promise<void> {
    for (const job of seededJobs) {
      await this.databaseService.query(
        `
          insert into jobs (
            id,
            job_number,
            location_id,
            bill_to_customer_id,
            job_type,
            category,
            origin,
            summary,
            status,
            work_order_number,
            created_at,
            updated_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          on conflict (id) do nothing
        `,
        [
          job.id,
          job.jobNumber,
          job.locationId,
          job.billToCustomerId,
          job.jobType,
          job.category,
          job.origin,
          job.summary,
          job.status,
          job.workOrderNumber ?? null,
          job.createdAt,
          job.updatedAt
        ]
      );
    }
  }

  private async seedAppointments(): Promise<void> {
    for (const appointment of seededAppointments) {
      await this.databaseService.query(
        `
          insert into appointments (
            id,
            job_id,
            scheduled_date,
            time_window_label,
            technician_id,
            status,
            created_at,
            updated_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8)
          on conflict (id) do nothing
        `,
        [
          appointment.id,
          appointment.jobId,
          appointment.scheduledDate ?? null,
          appointment.timeWindowLabel ?? null,
          appointment.technicianId ?? null,
          appointment.status,
          appointment.createdAt,
          appointment.updatedAt
        ]
      );
    }
  }

  private async seedTimelineEntries(): Promise<void> {
    for (const job of seededJobs) {
      for (const entry of job.timeline) {
        await this.databaseService.query(
          `
            insert into job_timeline_entries (id, job_id, occurred_at, actor_name, kind, message)
            values ($1, $2, $3, $4, $5, $6)
            on conflict (id) do nothing
          `,
          [entry.id, job.id, entry.occurredAt, entry.actorName, entry.kind, entry.message]
        );
      }
    }
  }

  private async alignJobNumberSequence(): Promise<void> {
    await this.databaseService.query(`
      select setval(
        'job_number_sequence',
        greatest(
          coalesce((select max(job_number::integer) from jobs where job_number ~ '^[0-9]+$'), 1002),
          1002
        )
      )
    `);
  }
}
