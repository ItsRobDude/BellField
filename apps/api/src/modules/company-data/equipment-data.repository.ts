import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService, type QueryExecutor } from '../../database/database.service';
import { toIsoString, toOptionalDateString, toTextArray } from '../../database/database-row.utils';
import type {
  CreateEquipmentInput,
  EquipmentGroupRecord,
  EquipmentHistoryRecord,
  EquipmentRecord,
  UpdateEquipmentInput
} from './company-data.types';

type EquipmentRow = {
  id: string;
  locationId: string | null;
  inventoryLocationLabel: string | null;
  equipmentType: string;
  brand: string;
  model: string;
  serialNumber: string | null;
  filterSizes: string[] | null;
  equipmentLocationDescription: string | null;
  installDate: string | Date | null;
  warrantyStartDate: string | Date | null;
  warrantyEndDate: string | Date | null;
  warrantyProviderNote: string | null;
  systemGroupId: string | null;
  systemGroupName: string | null;
  replacesEquipmentId: string | null;
  replacedByEquipmentId: string | null;
  status: EquipmentRecord['status'];
  notes: string;
  createdAt: string | Date;
  updatedAt: string | Date;
};

type EquipmentGroupRow = {
  id: string;
  name: string;
  locationId: string | null;
  inventoryLocationLabel: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

type EquipmentHistoryRow = {
  id: string;
  equipmentId: string;
  occurredAt: string | Date;
  actorName: string;
  kind: EquipmentHistoryRecord['kind'];
  message: string;
};

@Injectable()
export class EquipmentDataRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async listEquipment(includeInactive: boolean): Promise<EquipmentRecord[]> {
    const result = await this.databaseService.query<EquipmentRow>(
      `
        select
          equipment.id,
          equipment.location_id as "locationId",
          equipment.inventory_location_label as "inventoryLocationLabel",
          equipment.equipment_type as "equipmentType",
          equipment.brand,
          equipment.model,
          equipment.serial_number as "serialNumber",
          equipment.filter_sizes as "filterSizes",
          equipment.equipment_location_description as "equipmentLocationDescription",
          equipment.install_date as "installDate",
          equipment.warranty_start_date as "warrantyStartDate",
          equipment.warranty_end_date as "warrantyEndDate",
          equipment.warranty_provider_note as "warrantyProviderNote",
          equipment.system_group_id as "systemGroupId",
          equipment_group.name as "systemGroupName",
          equipment.replaces_equipment_id as "replacesEquipmentId",
          replacement.id as "replacedByEquipmentId",
          equipment.status,
          equipment.notes,
          equipment.created_at as "createdAt",
          equipment.updated_at as "updatedAt"
        from equipment
        left join equipment_system_groups equipment_group on equipment_group.id = equipment.system_group_id
        left join equipment replacement on replacement.replaces_equipment_id = equipment.id
        where $1::boolean = true or equipment.status not in ('inactive', 'removed')
        order by equipment.created_at asc
      `,
      [includeInactive]
    );

    return result.rows.map((row) => this.toEquipmentRecord(row));
  }

  async listEquipmentByLocation(
    locationId: string,
    includeInactive: boolean
  ): Promise<EquipmentRecord[]> {
    const result = await this.databaseService.query<EquipmentRow>(
      `
        select
          equipment.id,
          equipment.location_id as "locationId",
          equipment.inventory_location_label as "inventoryLocationLabel",
          equipment.equipment_type as "equipmentType",
          equipment.brand,
          equipment.model,
          equipment.serial_number as "serialNumber",
          equipment.filter_sizes as "filterSizes",
          equipment.equipment_location_description as "equipmentLocationDescription",
          equipment.install_date as "installDate",
          equipment.warranty_start_date as "warrantyStartDate",
          equipment.warranty_end_date as "warrantyEndDate",
          equipment.warranty_provider_note as "warrantyProviderNote",
          equipment.system_group_id as "systemGroupId",
          equipment_group.name as "systemGroupName",
          equipment.replaces_equipment_id as "replacesEquipmentId",
          replacement.id as "replacedByEquipmentId",
          equipment.status,
          equipment.notes,
          equipment.created_at as "createdAt",
          equipment.updated_at as "updatedAt"
        from equipment
        left join equipment_system_groups equipment_group on equipment_group.id = equipment.system_group_id
        left join equipment replacement on replacement.replaces_equipment_id = equipment.id
        where equipment.location_id = $1
          and ($2::boolean = true or equipment.status not in ('inactive', 'removed'))
        order by equipment.created_at asc
      `,
      [locationId, includeInactive]
    );

    return result.rows.map((row) => this.toEquipmentRecord(row));
  }

  async listEquipmentByLocations(
    locationIds: string[],
    includeInactive: boolean
  ): Promise<EquipmentRecord[]> {
    if (locationIds.length === 0) {
      return [];
    }

    const result = await this.databaseService.query<EquipmentRow>(
      `
        select
          equipment.id,
          equipment.location_id as "locationId",
          equipment.inventory_location_label as "inventoryLocationLabel",
          equipment.equipment_type as "equipmentType",
          equipment.brand,
          equipment.model,
          equipment.serial_number as "serialNumber",
          equipment.filter_sizes as "filterSizes",
          equipment.equipment_location_description as "equipmentLocationDescription",
          equipment.install_date as "installDate",
          equipment.warranty_start_date as "warrantyStartDate",
          equipment.warranty_end_date as "warrantyEndDate",
          equipment.warranty_provider_note as "warrantyProviderNote",
          equipment.system_group_id as "systemGroupId",
          equipment_group.name as "systemGroupName",
          equipment.replaces_equipment_id as "replacesEquipmentId",
          replacement.id as "replacedByEquipmentId",
          equipment.status,
          equipment.notes,
          equipment.created_at as "createdAt",
          equipment.updated_at as "updatedAt"
        from equipment
        left join equipment_system_groups equipment_group on equipment_group.id = equipment.system_group_id
        left join equipment replacement on replacement.replaces_equipment_id = equipment.id
        where equipment.location_id = any($1::text[])
          and ($2::boolean = true or equipment.status not in ('inactive', 'removed'))
        order by equipment.location_id asc, equipment.created_at asc
      `,
      [locationIds, includeInactive]
    );

    return result.rows.map((row) => this.toEquipmentRecord(row));
  }

  async listEquipmentByIds(equipmentIds: string[]): Promise<EquipmentRecord[]> {
    if (equipmentIds.length === 0) {
      return [];
    }

    const result = await this.databaseService.query<EquipmentRow>(
      `
        select
          equipment.id,
          equipment.location_id as "locationId",
          equipment.inventory_location_label as "inventoryLocationLabel",
          equipment.equipment_type as "equipmentType",
          equipment.brand,
          equipment.model,
          equipment.serial_number as "serialNumber",
          equipment.filter_sizes as "filterSizes",
          equipment.equipment_location_description as "equipmentLocationDescription",
          equipment.install_date as "installDate",
          equipment.warranty_start_date as "warrantyStartDate",
          equipment.warranty_end_date as "warrantyEndDate",
          equipment.warranty_provider_note as "warrantyProviderNote",
          equipment.system_group_id as "systemGroupId",
          equipment_group.name as "systemGroupName",
          equipment.replaces_equipment_id as "replacesEquipmentId",
          replacement.id as "replacedByEquipmentId",
          equipment.status,
          equipment.notes,
          equipment.created_at as "createdAt",
          equipment.updated_at as "updatedAt"
        from equipment
        left join equipment_system_groups equipment_group on equipment_group.id = equipment.system_group_id
        left join equipment replacement on replacement.replaces_equipment_id = equipment.id
        where equipment.id = any($1::text[])
      `,
      [equipmentIds]
    );

    return result.rows.map((row) => this.toEquipmentRecord(row));
  }

  async getEquipmentById(
    equipmentId: string,
    queryable?: QueryExecutor
  ): Promise<EquipmentRecord | null> {
    const executor = queryable ?? this.databaseService;
    const result = await executor.query<EquipmentRow>(
      this.getEquipmentSelectSql(`
        where equipment.id = $1
        limit 1
      `),
      [equipmentId]
    );

    return result.rows[0] ? this.toEquipmentRecord(result.rows[0]) : null;
  }

  async createEquipment(
    input: CreateEquipmentInput,
    queryable?: QueryExecutor
  ): Promise<EquipmentRecord> {
    const executor = queryable ?? this.databaseService;
    const now = new Date().toISOString();
    const systemGroupId =
      input.systemGroupName && input.systemGroupName.trim().length > 0
        ? await this.findOrCreateSystemGroupId(
            {
              name: input.systemGroupName,
              locationId: input.locationId,
              inventoryLocationLabel: input.inventoryLocationLabel
            },
            executor
          )
        : undefined;

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
      warrantyStartDate: input.warrantyStartDate?.trim() || undefined,
      warrantyEndDate: input.warrantyEndDate?.trim() || undefined,
      warrantyProviderNote: input.warrantyProviderNote?.trim() || undefined,
      systemGroupId,
      status: input.status,
      notes: input.notes?.trim() || '',
      createdAt: now,
      updatedAt: now
    };

    await this.saveEquipment(record, true, executor);
    // Re-read on the SAME executor so this works inside a caller's open transaction
    // (reading via the pool would not see the uncommitted row).
    return (await this.getEquipmentById(record.id, executor)) as EquipmentRecord;
  }

  async updateEquipment(
    equipmentId: string,
    update: UpdateEquipmentInput,
    queryable?: QueryExecutor
  ): Promise<EquipmentRecord | null> {
    const executor = queryable ?? this.databaseService;
    const existingEquipment = await this.getEquipmentById(equipmentId);

    if (!existingEquipment) {
      return null;
    }

    const nextLocationId =
      update.locationId !== undefined
        ? update.locationId || undefined
        : existingEquipment.locationId;
    const nextInventoryLocationLabel =
      update.inventoryLocationLabel !== undefined
        ? update.inventoryLocationLabel?.trim() || undefined
        : existingEquipment.inventoryLocationLabel;
    const placementChanged =
      nextLocationId !== existingEquipment.locationId ||
      nextInventoryLocationLabel !== existingEquipment.inventoryLocationLabel;

    existingEquipment.locationId = nextLocationId;
    existingEquipment.inventoryLocationLabel = nextInventoryLocationLabel;

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
      existingEquipment.equipmentLocationDescription =
        update.equipmentLocationDescription?.trim() || undefined;
    }

    if (update.installDate !== undefined) {
      existingEquipment.installDate = update.installDate?.trim() || undefined;
    }

    if (update.warrantyStartDate !== undefined) {
      existingEquipment.warrantyStartDate = update.warrantyStartDate?.trim() || undefined;
    }

    if (update.warrantyEndDate !== undefined) {
      existingEquipment.warrantyEndDate = update.warrantyEndDate?.trim() || undefined;
    }

    if (update.warrantyProviderNote !== undefined) {
      existingEquipment.warrantyProviderNote = update.warrantyProviderNote?.trim() || undefined;
    }

    if (update.status !== undefined) {
      existingEquipment.status = update.status;
    }

    if (update.notes !== undefined) {
      existingEquipment.notes = update.notes.trim();
    }

    if (update.clearSystemGroup) {
      existingEquipment.systemGroupId = undefined;
    } else if (update.systemGroupName !== undefined) {
      existingEquipment.systemGroupId =
        update.systemGroupName.trim().length > 0
          ? await this.findOrCreateSystemGroupId(
              {
                name: update.systemGroupName,
                locationId: existingEquipment.locationId,
                inventoryLocationLabel: existingEquipment.inventoryLocationLabel
              },
              executor
            )
          : undefined;
    } else if (placementChanged) {
      existingEquipment.systemGroupId = undefined;
    }

    existingEquipment.updatedAt = new Date().toISOString();

    await this.saveEquipment(existingEquipment, false, executor);
    return (await this.getEquipmentById(existingEquipment.id)) as EquipmentRecord;
  }

  async linkReplacement(
    equipmentId: string,
    replacementEquipmentId: string,
    queryable?: QueryExecutor
  ): Promise<void> {
    const executor = queryable ?? this.databaseService;
    await executor.query(
      `
        update equipment
        set replaces_equipment_id = $2, updated_at = now()
        where id = $1
      `,
      [replacementEquipmentId, equipmentId]
    );
  }

  async deleteEquipment(equipmentId: string, queryable?: QueryExecutor): Promise<void> {
    const executor = queryable ?? this.databaseService;
    await executor.query('delete from equipment where id = $1', [equipmentId]);
  }

  async listEquipmentHistory(equipmentId: string): Promise<EquipmentHistoryRecord[]> {
    const result = await this.databaseService.query<EquipmentHistoryRow>(
      `
        select
          id,
          equipment_id as "equipmentId",
          occurred_at as "occurredAt",
          actor_name as "actorName",
          kind,
          message
        from equipment_history_entries
        where equipment_id = $1
        order by occurred_at desc, id desc
      `,
      [equipmentId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      equipmentId: row.equipmentId,
      occurredAt: toIsoString(row.occurredAt),
      actorName: row.actorName,
      kind: row.kind,
      message: row.message
    }));
  }

  async addEquipmentHistoryEntry(
    entry: EquipmentHistoryRecord,
    queryable?: QueryExecutor
  ): Promise<void> {
    const executor = queryable ?? this.databaseService;
    await executor.query(
      `
        insert into equipment_history_entries (id, equipment_id, occurred_at, actor_name, kind, message)
        values ($1, $2, $3, $4, $5, $6)
      `,
      [entry.id, entry.equipmentId, entry.occurredAt, entry.actorName, entry.kind, entry.message]
    );
  }

  async getEquipmentGroupById(groupId: string): Promise<EquipmentGroupRecord | null> {
    const result = await this.databaseService.query<EquipmentGroupRow>(
      `
        select
          id,
          name,
          location_id as "locationId",
          inventory_location_label as "inventoryLocationLabel",
          created_at as "createdAt",
          updated_at as "updatedAt"
        from equipment_system_groups
        where id = $1
        limit 1
      `,
      [groupId]
    );

    return result.rows[0] ? this.toEquipmentGroupRecord(result.rows[0]) : null;
  }

  private async saveEquipment(
    record: EquipmentRecord,
    isInsert: boolean,
    queryable: QueryExecutor
  ): Promise<void> {
    if (isInsert) {
      await queryable.query(
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
        `,
        [
          record.id,
          record.locationId ?? null,
          record.inventoryLocationLabel ?? null,
          record.equipmentType,
          record.brand,
          record.model,
          record.serialNumber || null,
          record.filterSizes,
          record.equipmentLocationDescription ?? null,
          record.installDate ?? null,
          record.warrantyStartDate ?? null,
          record.warrantyEndDate ?? null,
          record.warrantyProviderNote ?? null,
          record.systemGroupId ?? null,
          record.replacesEquipmentId ?? null,
          record.status,
          record.notes,
          record.createdAt,
          record.updatedAt
        ]
      );

      return;
    }

    await queryable.query(
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
          warranty_start_date = $11,
          warranty_end_date = $12,
          warranty_provider_note = $13,
          system_group_id = $14,
          replaces_equipment_id = $15,
          status = $16,
          notes = $17,
          updated_at = $18
        where id = $1
      `,
      [
        record.id,
        record.locationId ?? null,
        record.inventoryLocationLabel ?? null,
        record.equipmentType,
        record.brand,
        record.model,
        record.serialNumber || null,
        record.filterSizes,
        record.equipmentLocationDescription ?? null,
        record.installDate ?? null,
        record.warrantyStartDate ?? null,
        record.warrantyEndDate ?? null,
        record.warrantyProviderNote ?? null,
        record.systemGroupId ?? null,
        record.replacesEquipmentId ?? null,
        record.status,
        record.notes,
        record.updatedAt
      ]
    );
  }

  private async findOrCreateSystemGroupId(
    input: { name: string; locationId?: string; inventoryLocationLabel?: string },
    queryable: QueryExecutor
  ): Promise<string> {
    const normalizedName = input.name.trim();
    const normalizedInventoryLocationLabel = input.inventoryLocationLabel?.trim() || undefined;

    if (input.locationId) {
      const existing = await queryable.query<{ id: string }>(
        `
          select id
          from equipment_system_groups
          where location_id = $1
            and name = $2
          limit 1
        `,
        [input.locationId, normalizedName]
      );

      if (existing.rows[0]) {
        return existing.rows[0].id;
      }
    } else if (normalizedInventoryLocationLabel) {
      const existing = await queryable.query<{ id: string }>(
        `
          select id
          from equipment_system_groups
          where location_id is null
            and inventory_location_label = $1
            and name = $2
          limit 1
        `,
        [normalizedInventoryLocationLabel, normalizedName]
      );

      if (existing.rows[0]) {
        return existing.rows[0].id;
      }
    }

    const groupId = randomUUID();
    await queryable.query(
      `
        insert into equipment_system_groups (
          id,
          name,
          location_id,
          inventory_location_label
        )
        values ($1, $2, $3, $4)
      `,
      [groupId, normalizedName, input.locationId ?? null, normalizedInventoryLocationLabel ?? null]
    );

    return groupId;
  }

  private getEquipmentSelectSql(whereClause: string): string {
    return `
      select
        equipment.id,
        equipment.location_id as "locationId",
        equipment.inventory_location_label as "inventoryLocationLabel",
        equipment.equipment_type as "equipmentType",
        equipment.brand,
        equipment.model,
        equipment.serial_number as "serialNumber",
        equipment.filter_sizes as "filterSizes",
        equipment.equipment_location_description as "equipmentLocationDescription",
        equipment.install_date as "installDate",
        equipment.warranty_start_date as "warrantyStartDate",
        equipment.warranty_end_date as "warrantyEndDate",
        equipment.warranty_provider_note as "warrantyProviderNote",
        equipment.system_group_id as "systemGroupId",
        equipment_group.name as "systemGroupName",
        equipment.replaces_equipment_id as "replacesEquipmentId",
        replacement.id as "replacedByEquipmentId",
        equipment.status,
        equipment.notes,
        equipment.created_at as "createdAt",
        equipment.updated_at as "updatedAt"
      from equipment
      left join equipment_system_groups equipment_group on equipment_group.id = equipment.system_group_id
      left join equipment replacement on replacement.replaces_equipment_id = equipment.id
      ${whereClause}
    `;
  }

  private toEquipmentRecord(row: EquipmentRow): EquipmentRecord {
    return {
      id: row.id,
      locationId: row.locationId ?? undefined,
      inventoryLocationLabel: row.inventoryLocationLabel ?? undefined,
      equipmentType: row.equipmentType,
      brand: row.brand,
      model: row.model,
      serialNumber: row.serialNumber ?? '',
      filterSizes: toTextArray(row.filterSizes),
      equipmentLocationDescription: row.equipmentLocationDescription ?? undefined,
      installDate: toOptionalDateString(row.installDate),
      warrantyStartDate: toOptionalDateString(row.warrantyStartDate),
      warrantyEndDate: toOptionalDateString(row.warrantyEndDate),
      warrantyProviderNote: row.warrantyProviderNote ?? undefined,
      systemGroupId: row.systemGroupId ?? undefined,
      replacesEquipmentId: row.replacesEquipmentId ?? undefined,
      replacedByEquipmentId: row.replacedByEquipmentId ?? undefined,
      status: row.status,
      notes: row.notes,
      createdAt: toIsoString(row.createdAt),
      updatedAt: toIsoString(row.updatedAt)
    };
  }

  private toEquipmentGroupRecord(row: EquipmentGroupRow): EquipmentGroupRecord {
    return {
      id: row.id,
      name: row.name,
      locationId: row.locationId ?? undefined,
      inventoryLocationLabel: row.inventoryLocationLabel ?? undefined,
      createdAt: toIsoString(row.createdAt),
      updatedAt: toIsoString(row.updatedAt)
    };
  }

  private normalizeFilterSizes(filterSizes: string[]): string[] {
    return [...new Set(filterSizes.map((value) => value.trim()).filter(Boolean))];
  }
}
