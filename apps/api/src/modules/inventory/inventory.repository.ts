import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  FieldTruckStockItem,
  InventoryMovement,
  InventoryMovementKind,
  InventoryOnHandRow,
  JobStatus
} from '@bellfield/contracts';
import { DatabaseService } from '../../database/database.service';
import { toIsoString } from '../../database/database-row.utils';
import { lockJobForCostWrite } from '../company-data/job-cost-write-guard';
import { queryInventoryOnHand } from './inventory-onhand-query';
import {
  applyAdjustment,
  applyIssueToJob,
  applyTransfer,
  roundMoney,
  type LedgerActor
} from './inventory-ledger-utils';
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

  // --- Ledger (on-hand, movements, adjustments, transfers) -----------------

  /** Derived on-hand per (item, location), excluding zeroed-out balances. The calculation lives in a
   * shared helper so the inventory-valuation report reuses the exact same weighted-average math. */
  async getOnHand(): Promise<InventoryOnHandRow[]> {
    return queryInventoryOnHand(this.databaseService);
  }

  /**
   * Pickable truck stock for one technician: every active PART with positive on-hand on a truck
   * location assigned to that employee. Drives the field part-add picker; equipment and
   * zero/negative balances are excluded. Deliberately returns NO cost — the field device never
   * needs company cost data, and the server recomputes the weighted-average when it issues stock.
   */
  async listTruckStockForEmployee(employeeId: string): Promise<FieldTruckStockItem[]> {
    const result = await this.databaseService.query<{
      itemId: string;
      sku: string | null;
      itemName: string;
      unitOfMeasure: string | null;
      locationId: string;
      locationName: string;
      quantity: string | number;
    }>(
      `select
         m.item_id as "itemId",
         it.sku as "sku",
         it.name as "itemName",
         it.unit_of_measure as "unitOfMeasure",
         m.location_id as "locationId",
         loc.name as "locationName",
         sum(m.quantity) as "quantity"
       from inventory_movements m
       join inventory_items it on it.id = m.item_id
       join inventory_locations loc on loc.id = m.location_id
       where m.location_id is not null
         and loc.kind = 'truck'
         and loc.assigned_employee_id = $1
         and loc.is_active = true
         and it.is_active = true
         and it.kind = 'part'
       group by m.item_id, it.sku, it.name, it.unit_of_measure, m.location_id, loc.name
       having sum(m.quantity) > 0
       order by it.name asc, loc.name asc`,
      [employeeId]
    );
    return result.rows.map((row) => ({
      itemId: row.itemId,
      sku: row.sku ?? undefined,
      itemName: row.itemName,
      unitOfMeasure: row.unitOfMeasure ?? undefined,
      locationId: row.locationId,
      locationName: row.locationName,
      quantityOnHand: Math.round(Number(row.quantity) * 10000) / 10000
    }));
  }

  /** Recent movements, optionally filtered to one item or one job. Newest first. */
  async listMovements(
    filter: { itemId?: string; jobId?: string },
    limit: number
  ): Promise<InventoryMovement[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filter.itemId) {
      params.push(filter.itemId);
      conditions.push(`m.item_id = $${params.length}`);
    }
    if (filter.jobId) {
      params.push(filter.jobId);
      conditions.push(`m.job_id = $${params.length}`);
    }
    params.push(limit);
    const where = conditions.length ? `where ${conditions.join(' and ')}` : '';
    const result = await this.databaseService.query<{
      id: string;
      itemId: string;
      itemName: string;
      kind: InventoryMovementKind;
      quantity: string | number;
      unitCost: string | number;
      locationId: string | null;
      locationName: string | null;
      jobId: string | null;
      note: string | null;
      actorName: string;
      occurredAt: string | Date;
    }>(
      `select
         m.id, m.item_id as "itemId", it.name as "itemName", m.kind,
         m.quantity, m.unit_cost as "unitCost",
         m.location_id as "locationId", loc.name as "locationName",
         m.job_id as "jobId", m.note, m.actor_name as "actorName",
         m.occurred_at as "occurredAt"
       from inventory_movements m
       join inventory_items it on it.id = m.item_id
       left join inventory_locations loc on loc.id = m.location_id
       ${where}
       order by m.occurred_at desc, m.created_at desc
       limit $${params.length}`,
      params
    );
    return result.rows.map((row) => ({
      id: row.id,
      itemId: row.itemId,
      itemName: row.itemName,
      kind: row.kind,
      quantity: Math.round(Number(row.quantity) * 10000) / 10000,
      unitCost: roundMoney(Number(row.unitCost)),
      locationId: row.locationId ?? undefined,
      locationName: row.locationName ?? undefined,
      jobId: row.jobId ?? undefined,
      note: row.note ?? undefined,
      actorName: row.actorName,
      occurredAt: toIsoString(row.occurredAt)
    }));
  }

  /** Record a stock adjustment (gain/loss) atomically. */
  async recordAdjustment(input: {
    itemId: string;
    locationId: string;
    quantityDelta: number;
    unitCost?: number;
    note?: string;
    actor: LedgerActor;
  }): Promise<void> {
    const occurredAt = new Date().toISOString();
    await this.databaseService.transaction((queryable) =>
      applyAdjustment(queryable, { ...input, occurredAt })
    );
  }

  /** Move stock between two locations atomically. */
  async recordTransfer(input: {
    itemId: string;
    fromLocationId: string;
    toLocationId: string;
    quantity: number;
    note?: string;
    actor: LedgerActor;
  }): Promise<void> {
    const occurredAt = new Date().toISOString();
    await this.databaseService.transaction((queryable) =>
      applyTransfer(queryable, { ...input, occurredAt })
    );
  }

  /** Issue stock from a location to a job atomically. */
  async recordIssueToJob(input: {
    itemId: string;
    locationId: string;
    jobId: string;
    quantity: number;
    note?: string;
    actor: LedgerActor;
  }): Promise<void> {
    const occurredAt = new Date().toISOString();
    await this.databaseService.transaction(async (queryable) => {
      // Lock the job and reject final jobs in the same transaction as the movement, so the
      // status check and the cost-bearing write commit atomically against a concurrent
      // completion (which freezes the cost snapshot under the same lock).
      await lockJobForCostWrite(queryable, input.jobId);
      await applyIssueToJob(queryable, { ...input, occurredAt });
    });
  }

  /** The job's status, or null if it does not exist (validation for issue-to-job, read-only). */
  async getJobStatus(jobId: string): Promise<JobStatus | null> {
    const result = await this.databaseService.query<{ status: JobStatus }>(
      `select status from jobs where id = $1 limit 1`,
      [jobId]
    );
    return result.rows[0]?.status ?? null;
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
