import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { getApiRuntimeConfig } from '../common/config/runtime-config';
import {
  seededAppointments,
  seededContacts,
  seededCustomers,
  seededEquipment,
  seededEquipmentGroups,
  seededEquipmentHistory,
  seededJobs,
  seededLocationContactLinks,
  seededLocations,
  seededLocationOwnershipHistory
} from '../modules/company-data/seed-company-data';
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
    await this.seedLocationContactLinks();
    await this.seedLocationOwnershipHistory();
    await this.seedEquipmentGroups();
    await this.seedEquipment();
    await this.seedEquipmentHistory();
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
          on conflict (id) do nothing
        `,
        [
          customer.id,
          customer.name,
          customer.accountType,
          customer.isActive,
          customer.billingAddressLine1,
          customer.billingCity,
          customer.billingState,
          customer.billingPostalCode,
          customer.phone ?? null,
          customer.email ?? null,
          customer.fax ?? null,
          customer.flags
        ]
      );
    }
  }

  private async seedContacts(): Promise<void> {
    for (const contact of seededContacts) {
      await this.databaseService.query(
        `
          insert into contacts (id, display_name, phone, email, fax, tags, is_active)
          values ($1, $2, $3, $4, $5, $6::text[], $7)
          on conflict (id) do nothing
        `,
        [
          contact.id,
          contact.displayName,
          contact.phone ?? null,
          contact.email ?? null,
          contact.fax ?? null,
          contact.tags,
          contact.isActive
        ]
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
            phone,
            email,
            fax,
            is_active,
            alternate_bill_to_customer_ids
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::text[])
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
          location.phone ?? null,
          location.email ?? null,
          location.fax ?? null,
          location.isActive,
          location.alternateBillToCustomerIds
        ]
      );
    }
  }

  private async seedLocationContactLinks(): Promise<void> {
    for (const link of seededLocationContactLinks) {
      await this.databaseService.query(
        `
          insert into location_contact_links (
            id,
            location_id,
            contact_id,
            phone_override,
            email_override,
            fax_override,
            tags,
            is_active,
            end_date
          )
          values ($1, $2, $3, $4, $5, $6, $7::text[], $8, $9)
          on conflict (id) do nothing
        `,
        [
          link.id,
          link.linkedRecordId,
          link.contactId,
          link.phone ?? null,
          link.email ?? null,
          link.fax ?? null,
          link.tags,
          link.isActive,
          link.endDate ?? null
        ]
      );
    }
  }

  private async seedLocationOwnershipHistory(): Promise<void> {
    for (const entry of seededLocationOwnershipHistory) {
      await this.databaseService.query(
        `
          insert into location_ownership_history (
            id,
            location_id,
            customer_id,
            started_at,
            ended_at,
            note
          )
          values ($1, $2, $3, $4, $5, $6)
          on conflict (id) do nothing
        `,
        [
          entry.id,
          entry.locationId,
          entry.customerId,
          entry.startedAt,
          entry.endedAt ?? null,
          entry.note ?? null
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
            warranty_start_date,
            warranty_end_date,
            warranty_provider_note,
            system_group_id,
            replaces_equipment_id,
            status,
            notes,
            created_at,
            updated_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8::text[], $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
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
          equipmentRecord.warrantyStartDate ?? null,
          equipmentRecord.warrantyEndDate ?? null,
          equipmentRecord.warrantyProviderNote ?? null,
          equipmentRecord.systemGroupId ?? null,
          equipmentRecord.replacesEquipmentId ?? null,
          equipmentRecord.status,
          equipmentRecord.notes,
          equipmentRecord.createdAt,
          equipmentRecord.updatedAt
        ]
      );
    }
  }

  private async seedEquipmentGroups(): Promise<void> {
    for (const equipmentGroup of seededEquipmentGroups) {
      await this.databaseService.query(
        `
          insert into equipment_system_groups (
            id,
            name,
            location_id,
            inventory_location_label,
            created_at,
            updated_at
          )
          values ($1, $2, $3, $4, $5, $6)
          on conflict (id) do nothing
        `,
        [
          equipmentGroup.id,
          equipmentGroup.name,
          equipmentGroup.locationId ?? null,
          equipmentGroup.inventoryLocationLabel ?? null,
          equipmentGroup.createdAt,
          equipmentGroup.updatedAt
        ]
      );
    }
  }

  private async seedEquipmentHistory(): Promise<void> {
    for (const entry of seededEquipmentHistory) {
      await this.databaseService.query(
        `
          insert into equipment_history_entries (
            id,
            equipment_id,
            occurred_at,
            actor_name,
            kind,
            message
          )
          values ($1, $2, $3, $4, $5, $6)
          on conflict (id) do nothing
        `,
        [entry.id, entry.equipmentId, entry.occurredAt, entry.actorName, entry.kind, entry.message]
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

      // Seeded jobs bypass the normal create path, so give each its one main
      // invoice draft here too. Idempotent, so re-running the seed stays safe.
      // One placeholder per column to match the seed-insert convention.
      await this.databaseService.query(
        `
          insert into invoices (
            id,
            job_id,
            invoice_kind,
            status,
            created_at,
            updated_at,
            version
          )
          values ($1, $2, $3, $4, $5, $6, $7)
          on conflict (job_id) where invoice_kind = 'main' do nothing
        `,
        [`invoice-main-${job.id}`, job.id, 'main', 'draft', job.createdAt, job.createdAt, 1]
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
            scheduled_start_time,
            scheduled_end_time,
            time_window_label,
            technician_id,
            status,
            finish_outcome,
            visit_notes,
            has_charge_activity,
            register_follow_up_note,
            created_at,
            updated_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          on conflict (id) do nothing
        `,
        [
          appointment.id,
          appointment.jobId,
          appointment.scheduledDate ?? null,
          appointment.scheduledStartTime ?? null,
          appointment.scheduledEndTime ?? null,
          appointment.timeWindowLabel ?? null,
          appointment.technicianId ?? null,
          appointment.status,
          appointment.finishOutcome ?? null,
          appointment.visitNotes ?? null,
          appointment.hasChargeActivity ?? null,
          appointment.registerFollowUpNote ?? null,
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
