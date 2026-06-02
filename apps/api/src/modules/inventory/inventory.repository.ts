import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service';
import { toIsoString } from '../../database/database-row.utils';
import type {
  CreateInventoryItemRequestDto,
  CreateInventoryLocationRequestDto,
  InventoryItemKindValue,
  InventoryItemRecord,
  InventoryLocationKindValue,
  InventoryLocationRecord,
  UpdateInventoryItemRequestDto,
  UpdateInventoryLocationRequestDto
} from './inventory.types';

type ItemRow = {
  id: string;
  sku: string | null;
  name: string;
  kind: InventoryItemKindValue;
  unitOfMeasure: string | null;
  defaultUnitCost: string | number | null;
  description: string | null;
  isActive: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
};

type LocationRow = {
  id: string;
  name: string;
  kind: InventoryLocationKindValue;
  assignedEmployeeId: string | null;
  assignedEmployeeName: string | null;
  isActive: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
};

const ITEM_COLUMNS = `
  id, sku, name, kind,
  unit_of_measure as "unitOfMeasure",
  default_unit_cost as "defaultUnitCost",
  description,
  is_active as "isActive",
  created_at as "createdAt",
  updated_at as "updatedAt"
`;

@Injectable()
export class InventoryRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  // --- Items ---------------------------------------------------------------

  async listItems(): Promise<InventoryItemRecord[]> {
    const result = await this.databaseService.query<ItemRow>(
      `select ${ITEM_COLUMNS} from inventory_items order by is_active desc, name asc`
    );
    return result.rows.map(toItemRecord);
  }

  async getItemById(id: string): Promise<InventoryItemRecord | null> {
    const result = await this.databaseService.query<ItemRow>(
      `select ${ITEM_COLUMNS} from inventory_items where id = $1 limit 1`,
      [id]
    );
    return result.rows[0] ? toItemRecord(result.rows[0]) : null;
  }

  async createItem(input: CreateInventoryItemRequestDto): Promise<InventoryItemRecord> {
    const id = randomUUID();
    const now = new Date().toISOString();
    await this.databaseService.query(
      `insert into inventory_items
         (id, sku, name, kind, unit_of_measure, default_unit_cost, description, is_active, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, true, $8, $8)`,
      [
        id,
        input.sku?.trim() || null,
        input.name.trim(),
        input.kind,
        input.unitOfMeasure?.trim() || null,
        input.defaultUnitCost ?? null,
        input.description?.trim() || null,
        now
      ]
    );
    return (await this.getItemById(id))!;
  }

  async updateItem(id: string, input: UpdateInventoryItemRequestDto): Promise<void> {
    const now = new Date().toISOString();
    await this.databaseService.query(
      `update inventory_items set
         sku = $2, name = $3, kind = $4, unit_of_measure = $5,
         default_unit_cost = $6, description = $7, is_active = $8, updated_at = $9
       where id = $1`,
      [
        id,
        input.sku?.trim() || null,
        input.name.trim(),
        input.kind,
        input.unitOfMeasure?.trim() || null,
        input.defaultUnitCost ?? null,
        input.description?.trim() || null,
        input.isActive,
        now
      ]
    );
  }

  // --- Locations -----------------------------------------------------------

  async listLocations(): Promise<InventoryLocationRecord[]> {
    const result = await this.databaseService.query<LocationRow>(
      `select
         il.id, il.name, il.kind,
         il.assigned_employee_id as "assignedEmployeeId",
         e.display_name as "assignedEmployeeName",
         il.is_active as "isActive",
         il.created_at as "createdAt",
         il.updated_at as "updatedAt"
       from inventory_locations il
       left join employees e on e.id = il.assigned_employee_id
       order by il.is_active desc, il.name asc`
    );
    return result.rows.map(toLocationRecord);
  }

  async getLocationById(id: string): Promise<InventoryLocationRecord | null> {
    const result = await this.databaseService.query<LocationRow>(
      `select
         il.id, il.name, il.kind,
         il.assigned_employee_id as "assignedEmployeeId",
         e.display_name as "assignedEmployeeName",
         il.is_active as "isActive",
         il.created_at as "createdAt",
         il.updated_at as "updatedAt"
       from inventory_locations il
       left join employees e on e.id = il.assigned_employee_id
       where il.id = $1 limit 1`,
      [id]
    );
    return result.rows[0] ? toLocationRecord(result.rows[0]) : null;
  }

  async createLocation(input: CreateInventoryLocationRequestDto): Promise<InventoryLocationRecord> {
    const id = randomUUID();
    const now = new Date().toISOString();
    await this.databaseService.query(
      `insert into inventory_locations
         (id, name, kind, assigned_employee_id, is_active, created_at, updated_at)
       values ($1, $2, $3, $4, true, $5, $5)`,
      [id, input.name.trim(), input.kind, input.assignedEmployeeId?.trim() || null, now]
    );
    return (await this.getLocationById(id))!;
  }

  async updateLocation(id: string, input: UpdateInventoryLocationRequestDto): Promise<void> {
    const now = new Date().toISOString();
    await this.databaseService.query(
      `update inventory_locations set
         name = $2, kind = $3, assigned_employee_id = $4, is_active = $5, updated_at = $6
       where id = $1`,
      [
        id,
        input.name.trim(),
        input.kind,
        input.assignedEmployeeId?.trim() || null,
        input.isActive,
        now
      ]
    );
  }
}

function toItemRecord(row: ItemRow): InventoryItemRecord {
  return {
    id: row.id,
    sku: row.sku ?? undefined,
    name: row.name,
    kind: row.kind,
    unitOfMeasure: row.unitOfMeasure ?? undefined,
    defaultUnitCost: row.defaultUnitCost === null ? undefined : Number(row.defaultUnitCost),
    description: row.description ?? undefined,
    isActive: row.isActive,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt)
  };
}

function toLocationRecord(row: LocationRow): InventoryLocationRecord {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    assignedEmployeeId: row.assignedEmployeeId ?? undefined,
    assignedEmployeeName: row.assignedEmployeeName ?? undefined,
    isActive: row.isActive,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt)
  };
}
