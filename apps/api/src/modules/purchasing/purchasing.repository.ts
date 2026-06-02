import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  PurchaseOrderDestinationKind,
  PurchaseOrderLine,
  PurchaseOrderLineKind,
  PurchaseOrderStatus
} from '@bellfield/contracts';
import { DatabaseService } from '../../database/database.service';
import { toIsoString } from '../../database/database-row.utils';
import type {
  CreatePurchaseOrderRequestDto,
  PurchaseOrderDto,
  PurchaseOrderSummaryDto
} from './purchasing.types';

type Actor = { id: string; displayName: string };

type HeaderRow = {
  id: string;
  poNumber: string | null;
  vendorName: string;
  status: PurchaseOrderStatus;
  destInvId: string | null;
  destCustId: string | null;
  destinationName: string | null;
  jobId: string | null;
  jobNumber: string | null;
  notes: string | null;
  orderedAt: string | Date | null;
  orderedByName: string | null;
  createdByName: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  lineCount: string | number;
  expectedTotalCost: string | number;
};

type LineRow = {
  id: string;
  position: number;
  itemId: string | null;
  itemName: string | null;
  kind: PurchaseOrderLineKind;
  description: string;
  quantity: string | number;
  expectedUnitCost: string | number;
  equipmentType: string | null;
  equipmentBrand: string | null;
  equipmentModel: string | null;
  equipmentSerial: string | null;
};

const HEADER_SELECT = `
  select
    po.id, po.po_number as "poNumber", po.vendor_name as "vendorName", po.status,
    po.destination_inventory_location_id as "destInvId",
    po.destination_location_id as "destCustId",
    coalesce(il.name, loc.name) as "destinationName",
    po.job_id as "jobId", j.job_number as "jobNumber",
    po.notes, po.ordered_at as "orderedAt", po.ordered_by_name as "orderedByName",
    po.created_by_name as "createdByName", po.created_at as "createdAt", po.updated_at as "updatedAt",
    (select count(*) from purchase_order_lines pol where pol.purchase_order_id = po.id) as "lineCount",
    (select coalesce(sum(pol.quantity * pol.expected_unit_cost), 0)
       from purchase_order_lines pol where pol.purchase_order_id = po.id) as "expectedTotalCost"
  from purchase_orders po
  left join inventory_locations il on il.id = po.destination_inventory_location_id
  left join locations loc on loc.id = po.destination_location_id
  left join jobs j on j.id = po.job_id
`;

@Injectable()
export class PurchasingRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async createPurchaseOrder(
    input: CreatePurchaseOrderRequestDto,
    actor: Actor
  ): Promise<PurchaseOrderDto> {
    const id = randomUUID();
    const now = new Date().toISOString();
    await this.databaseService.transaction(async (queryable) => {
      await queryable.query(
        `insert into purchase_orders (
           id, po_number, vendor_name, status,
           destination_inventory_location_id, destination_location_id, job_id, notes,
           created_by_employee_id, created_by_name, created_at, updated_at
         )
         values ($1, $2, $3, 'draft', $4, $5, $6, $7, $8, $9, $10, $10)`,
        [
          id,
          input.poNumber?.trim() || null,
          input.vendorName.trim(),
          input.destinationInventoryLocationId ?? null,
          input.destinationCustomerLocationId ?? null,
          input.jobId ?? null,
          input.notes?.trim() || null,
          actor.id,
          actor.displayName,
          now
        ]
      );

      let position = 0;
      for (const line of input.lines) {
        await queryable.query(
          `insert into purchase_order_lines (
             id, purchase_order_id, line_position, item_id, kind, description, quantity,
             expected_unit_cost, equipment_type, equipment_brand, equipment_model, equipment_serial,
             created_at, updated_at
           )
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)`,
          [
            randomUUID(),
            id,
            position,
            line.itemId ?? null,
            line.kind,
            line.description.trim(),
            line.quantity,
            line.expectedUnitCost,
            line.equipmentType?.trim() || null,
            line.equipmentBrand?.trim() || null,
            line.equipmentModel?.trim() || null,
            line.equipmentSerial?.trim() || null,
            now
          ]
        );
        position += 1;
      }
    });
    return (await this.getById(id))!;
  }

  async getById(id: string): Promise<PurchaseOrderDto | null> {
    const headerResult = await this.databaseService.query<HeaderRow>(
      `${HEADER_SELECT} where po.id = $1 limit 1`,
      [id]
    );
    const header = headerResult.rows[0];
    if (!header) {
      return null;
    }
    const lineResult = await this.databaseService.query<LineRow>(
      `select
         pol.id, pol.line_position as "position", pol.item_id as "itemId", it.name as "itemName",
         pol.kind, pol.description, pol.quantity, pol.expected_unit_cost as "expectedUnitCost",
         pol.equipment_type as "equipmentType", pol.equipment_brand as "equipmentBrand",
         pol.equipment_model as "equipmentModel", pol.equipment_serial as "equipmentSerial"
       from purchase_order_lines pol
       left join inventory_items it on it.id = pol.item_id
       where pol.purchase_order_id = $1
       order by pol.line_position asc`,
      [id]
    );
    return {
      ...toSummary(header),
      notes: header.notes ?? undefined,
      orderedAt: header.orderedAt ? toIsoString(header.orderedAt) : undefined,
      orderedByName: header.orderedByName ?? undefined,
      lines: lineResult.rows.map(toLine)
    };
  }

  async listSummaries(): Promise<PurchaseOrderSummaryDto[]> {
    const result = await this.databaseService.query<HeaderRow>(
      `${HEADER_SELECT} order by po.created_at desc`
    );
    return result.rows.map(toSummary);
  }

  async inventoryLocationExists(id: string): Promise<boolean> {
    const result = await this.databaseService.query(
      `select 1 from inventory_locations where id = $1 limit 1`,
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async customerLocationExists(id: string): Promise<boolean> {
    const result = await this.databaseService.query(
      `select 1 from locations where id = $1 limit 1`,
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async jobExists(id: string): Promise<boolean> {
    const result = await this.databaseService.query(`select 1 from jobs where id = $1 limit 1`, [
      id
    ]);
    return (result.rowCount ?? 0) > 0;
  }

  /** The customer service location a job is for, or null if the job is unknown. */
  async getJobLocationId(id: string): Promise<string | null> {
    const result = await this.databaseService.query<{ locationId: string | null }>(
      `select location_id as "locationId" from jobs where id = $1 limit 1`,
      [id]
    );
    return result.rows[0]?.locationId ?? null;
  }

  /** The catalog kind of an item, or null if the id is unknown. */
  async getItemKind(id: string): Promise<PurchaseOrderLineKind | null> {
    const result = await this.databaseService.query<{ kind: PurchaseOrderLineKind }>(
      `select kind from inventory_items where id = $1 limit 1`,
      [id]
    );
    return result.rows[0]?.kind ?? null;
  }

  /** Transition draft → ordered atomically. Returns false if the PO was not a draft. */
  async markOrdered(id: string, actor: Actor): Promise<boolean> {
    const now = new Date().toISOString();
    const result = await this.databaseService.query(
      `update purchase_orders set
         status = 'ordered', ordered_at = $2, ordered_by_employee_id = $3,
         ordered_by_name = $4, updated_at = $2
       where id = $1 and status = 'draft'`,
      [id, now, actor.id, actor.displayName]
    );
    return (result.rowCount ?? 0) > 0;
  }
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function toSummary(row: HeaderRow): PurchaseOrderSummaryDto {
  const destinationKind: PurchaseOrderDestinationKind = row.destInvId ? 'inventory' : 'customer';
  return {
    id: row.id,
    poNumber: row.poNumber ?? undefined,
    vendorName: row.vendorName,
    status: row.status,
    destinationKind,
    destinationId: row.destInvId ?? row.destCustId ?? '',
    destinationName: row.destinationName ?? '',
    jobId: row.jobId ?? undefined,
    jobNumber: row.jobNumber ?? undefined,
    expectedTotalCost: roundMoney(Number(row.expectedTotalCost)),
    lineCount: Number(row.lineCount),
    createdByName: row.createdByName,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt)
  };
}

function toLine(row: LineRow): PurchaseOrderLine {
  const quantity = Math.round(Number(row.quantity) * 10000) / 10000;
  const expectedUnitCost = roundMoney(Number(row.expectedUnitCost));
  return {
    id: row.id,
    position: row.position,
    itemId: row.itemId ?? undefined,
    itemName: row.itemName ?? undefined,
    kind: row.kind,
    description: row.description,
    quantity,
    expectedUnitCost,
    expectedLineCost: roundMoney(quantity * expectedUnitCost),
    equipmentType: row.equipmentType ?? undefined,
    equipmentBrand: row.equipmentBrand ?? undefined,
    equipmentModel: row.equipmentModel ?? undefined,
    equipmentSerial: row.equipmentSerial ?? undefined
  };
}
