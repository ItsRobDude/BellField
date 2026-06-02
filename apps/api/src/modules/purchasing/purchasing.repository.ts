import { ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  PurchaseOrderDestinationKind,
  PurchaseOrderLine,
  PurchaseOrderLineKind,
  PurchaseOrderStatus
} from '@bellfield/contracts';
import { DatabaseService } from '../../database/database.service';
import { toIsoString } from '../../database/database-row.utils';
import {
  applyReceiptToInventory,
  applyReceiptToJob,
  type LedgerActor
} from '../inventory/inventory-ledger-utils';
import type {
  CreatePurchaseOrderRequestDto,
  PurchaseOrderDto,
  PurchaseOrderSummaryDto
} from './purchasing.types';

export type ReceiveLineOverride = { quantity?: number; unitCost?: number };

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

  /**
   * Receive a purchase order in full, atomically: lock + re-check status, create the
   * receipt, and apply each line's effect — parts post inventory movements (to stock, or
   * to the job for a customer-destination PO with a job); equipment creates an asset row
   * (pendingInstall at a customer location, active at an inventory location). The PO moves
   * to 'received'. Line validation (item required for movement lines, equipment fields)
   * is done in the service before this runs.
   */
  async receivePurchaseOrder(
    id: string,
    overrides: Map<string, ReceiveLineOverride>,
    note: string | undefined,
    actor: LedgerActor
  ): Promise<void> {
    const now = new Date().toISOString();
    await this.databaseService.transaction(async (queryable) => {
      const poResult = await queryable.query<{
        poNumber: string | null;
        status: PurchaseOrderStatus;
        destInv: string | null;
        destCust: string | null;
        jobId: string | null;
      }>(
        `select po_number as "poNumber", status,
           destination_inventory_location_id as "destInv",
           destination_location_id as "destCust",
           job_id as "jobId"
         from purchase_orders where id = $1 for update`,
        [id]
      );
      const po = poResult.rows[0];
      if (!po) {
        throw new ConflictException('Purchase order not found.');
      }
      if (po.status === 'received' || po.status === 'closed') {
        throw new ConflictException(`Purchase order is already ${po.status}.`);
      }

      let inventoryLocationName: string | null = null;
      if (po.destInv) {
        const locResult = await queryable.query<{ name: string }>(
          `select name from inventory_locations where id = $1`,
          [po.destInv]
        );
        inventoryLocationName = locResult.rows[0]?.name ?? null;
      }

      const lineResult = await queryable.query<{
        id: string;
        itemId: string | null;
        kind: PurchaseOrderLineKind;
        quantity: string | number;
        expectedUnitCost: string | number;
        eqType: string | null;
        eqBrand: string | null;
        eqModel: string | null;
        eqSerial: string | null;
      }>(
        `select id, item_id as "itemId", kind, quantity, expected_unit_cost as "expectedUnitCost",
           equipment_type as "eqType", equipment_brand as "eqBrand",
           equipment_model as "eqModel", equipment_serial as "eqSerial"
         from purchase_order_lines where purchase_order_id = $1 order by line_position asc`,
        [id]
      );

      const receiptId = randomUUID();
      await queryable.query(
        `insert into purchase_receipts
           (id, purchase_order_id, received_at, received_by_employee_id, received_by_name, note, created_at)
         values ($1, $2, $3, $4, $5, $6, $3)`,
        [receiptId, id, now, actor.id, actor.displayName, note?.trim() || null]
      );

      const poLabel = po.poNumber ? `PO ${po.poNumber}` : 'a purchase order';

      for (const line of lineResult.rows) {
        const override = overrides.get(line.id) ?? {};
        const quantity = override.quantity ?? Number(line.quantity);
        const unitCost = override.unitCost ?? Number(line.expectedUnitCost);
        const receiptLineId = randomUUID();
        await queryable.query(
          `insert into purchase_receipt_lines
             (id, purchase_receipt_id, purchase_order_line_id, quantity, unit_cost, created_at)
           values ($1, $2, $3, $4, $5, $6)`,
          [receiptLineId, receiptId, line.id, quantity, unitCost, now]
        );

        if (line.kind === 'part') {
          if (po.destInv) {
            await applyReceiptToInventory(queryable, {
              itemId: line.itemId!,
              locationId: po.destInv,
              quantity,
              unitCost,
              sourceId: receiptLineId,
              actor,
              occurredAt: now
            });
          } else if (po.jobId) {
            await applyReceiptToJob(queryable, {
              itemId: line.itemId!,
              jobId: po.jobId,
              quantity,
              unitCost,
              sourceId: receiptLineId,
              actor,
              occurredAt: now
            });
          }
          // part to a customer location with no job: cost recorded on the receipt line only.
        } else {
          // Equipment: create the asset row (the bridge). pendingInstall at a customer
          // location, active at an inventory location. Equipment is a serialized asset, not
          // quantity stock, so it does not post an inventory movement.
          const equipmentId = randomUUID();
          const atCustomer = Boolean(po.destCust);
          await queryable.query(
            `insert into equipment
               (id, location_id, inventory_location_label, equipment_type, brand, model,
                serial_number, status, created_at, updated_at)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)`,
            [
              equipmentId,
              atCustomer ? po.destCust : null,
              atCustomer ? null : inventoryLocationName,
              line.eqType,
              line.eqBrand,
              line.eqModel,
              line.eqSerial?.trim() || '',
              atCustomer ? 'pendingInstall' : 'active',
              now
            ]
          );
          await queryable.query(
            `insert into equipment_history_entries
               (id, equipment_id, occurred_at, actor_name, kind, message, created_at)
             values ($1, $2, $3, $4, 'created', $5, $3)`,
            [randomUUID(), equipmentId, now, actor.displayName, `Received from ${poLabel}.`]
          );
          await queryable.query(
            `update purchase_receipt_lines set created_equipment_id = $2 where id = $1`,
            [receiptLineId, equipmentId]
          );
        }
      }

      await queryable.query(
        `update purchase_orders set status = 'received', updated_at = $2 where id = $1`,
        [id, now]
      );
    });
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
