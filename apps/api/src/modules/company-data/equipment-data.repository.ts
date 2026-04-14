import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service';
import { toIsoString, toOptionalDateString, toTextArray } from '../../database/database-row.utils';
import type { CreateEquipmentInput, EquipmentRecord, UpdateEquipmentInput } from './company-data.types';

type EquipmentRow = {
  id: string;
  locationId: string | null;
  inventoryLocationLabel: string | null;
  equipmentType: string;
  brand: string;
  model: string;
  serialNumber: string;
  filterSizes: string[] | null;
  equipmentLocationDescription: string | null;
  installDate: string | Date | null;
  status: EquipmentRecord['status'];
  notes: string;
  createdAt: string | Date;
  updatedAt: string | Date;
};

@Injectable()
export class EquipmentDataRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async listEquipment(includeInactive: boolean): Promise<EquipmentRecord[]> {
    const result = await this.databaseService.query<EquipmentRow>(
      `
        select
          id,
          location_id as "locationId",
          inventory_location_label as "inventoryLocationLabel",
          equipment_type as "equipmentType",
          brand,
          model,
          serial_number as "serialNumber",
          filter_sizes as "filterSizes",
          equipment_location_description as "equipmentLocationDescription",
          install_date as "installDate",
          status,
          notes,
          created_at as "createdAt",
          updated_at as "updatedAt"
        from equipment
        where $1::boolean = true or status <> 'inactive'
        order by created_at asc
      `,
      [includeInactive]
    );

    return result.rows.map((row) => this.toEquipmentRecord(row));
  }

  async getEquipmentById(equipmentId: string): Promise<EquipmentRecord | null> {
    const result = await this.databaseService.query<EquipmentRow>(
      `
        select
          id,
          location_id as "locationId",
          inventory_location_label as "inventoryLocationLabel",
          equipment_type as "equipmentType",
          brand,
          model,
          serial_number as "serialNumber",
          filter_sizes as "filterSizes",
          equipment_location_description as "equipmentLocationDescription",
          install_date as "installDate",
          status,
          notes,
          created_at as "createdAt",
          updated_at as "updatedAt"
        from equipment
        where id = $1
        limit 1
      `,
      [equipmentId]
    );

    return result.rows[0] ? this.toEquipmentRecord(result.rows[0]) : null;
  }

  async createEquipment(input: CreateEquipmentInput): Promise<EquipmentRecord> {
    const now = new Date().toISOString();
    const record: EquipmentRecord = {
      id: randomUUID(),
      locationId: input.locationId,
      inventoryLocationLabel: input.inventoryLocationLabel?.trim() || undefined,
      equipmentType: input.equipmentType.trim(),
      brand: input.brand.trim(),
      model: input.model.trim(),
      serialNumber: input.serialNumber.trim(),
      filterSizes: this.normalizeFilterSizes(input.filterSizes),
      equipmentLocationDescription: input.equipmentLocationDescription?.trim() || undefined,
      installDate: input.installDate?.trim() || undefined,
      status: input.status,
      notes: input.notes?.trim() || '',
      createdAt: now,
      updatedAt: now
    };

    await this.saveEquipment(record, true);
    return record;
  }

  async updateEquipment(equipmentId: string, update: UpdateEquipmentInput): Promise<EquipmentRecord | null> {
    const existingEquipment = await this.getEquipmentById(equipmentId);

    if (!existingEquipment) {
      return null;
    }

    if (update.locationId !== undefined) {
      existingEquipment.locationId = update.locationId || undefined;
    }

    if (update.inventoryLocationLabel !== undefined) {
      existingEquipment.inventoryLocationLabel = update.inventoryLocationLabel?.trim() || undefined;
    }

    if (update.equipmentType !== undefined) {
      existingEquipment.equipmentType = update.equipmentType.trim();
    }

    if (update.brand !== undefined) {
      existingEquipment.brand = update.brand.trim();
    }

    if (update.model !== undefined) {
      existingEquipment.model = update.model.trim();
    }

    if (update.serialNumber !== undefined) {
      existingEquipment.serialNumber = update.serialNumber.trim();
    }

    if (update.filterSizes !== undefined) {
      existingEquipment.filterSizes = this.normalizeFilterSizes(update.filterSizes);
    }

    if (update.equipmentLocationDescription !== undefined) {
      existingEquipment.equipmentLocationDescription = update.equipmentLocationDescription?.trim() || undefined;
    }

    if (update.installDate !== undefined) {
      existingEquipment.installDate = update.installDate?.trim() || undefined;
    }

    if (update.status !== undefined) {
      existingEquipment.status = update.status;
    }

    if (update.notes !== undefined) {
      existingEquipment.notes = update.notes.trim();
    }

    existingEquipment.updatedAt = new Date().toISOString();

    await this.saveEquipment(existingEquipment, false);
    return existingEquipment;
  }

  private async saveEquipment(record: EquipmentRecord, isInsert: boolean): Promise<void> {
    if (isInsert) {
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
        `,
        [
          record.id,
          record.locationId ?? null,
          record.inventoryLocationLabel ?? null,
          record.equipmentType,
          record.brand,
          record.model,
          record.serialNumber,
          record.filterSizes,
          record.equipmentLocationDescription ?? null,
          record.installDate ?? null,
          record.status,
          record.notes,
          record.createdAt,
          record.updatedAt
        ]
      );

      return;
    }

    await this.databaseService.query(
      `
        update equipment
        set
          location_id = $2,
          inventory_location_label = $3,
          equipment_type = $4,
          brand = $5,
          model = $6,
          serial_number = $7,
          filter_sizes = $8::text[],
          equipment_location_description = $9,
          install_date = $10,
          status = $11,
          notes = $12,
          updated_at = $13
        where id = $1
      `,
      [
        record.id,
        record.locationId ?? null,
        record.inventoryLocationLabel ?? null,
        record.equipmentType,
        record.brand,
        record.model,
        record.serialNumber,
        record.filterSizes,
        record.equipmentLocationDescription ?? null,
        record.installDate ?? null,
        record.status,
        record.notes,
        record.updatedAt
      ]
    );
  }

  private toEquipmentRecord(row: EquipmentRow): EquipmentRecord {
    return {
      id: row.id,
      locationId: row.locationId ?? undefined,
      inventoryLocationLabel: row.inventoryLocationLabel ?? undefined,
      equipmentType: row.equipmentType,
      brand: row.brand,
      model: row.model,
      serialNumber: row.serialNumber,
      filterSizes: toTextArray(row.filterSizes),
      equipmentLocationDescription: row.equipmentLocationDescription ?? undefined,
      installDate: toOptionalDateString(row.installDate),
      status: row.status,
      notes: row.notes,
      createdAt: toIsoString(row.createdAt),
      updatedAt: toIsoString(row.updatedAt)
    };
  }

  private normalizeFilterSizes(filterSizes: string[]): string[] {
    return [...new Set(filterSizes.map((value) => value.trim()).filter(Boolean))];
  }
}
