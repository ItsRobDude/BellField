import type { InventoryOnHandRow } from '@bellfield/contracts';
import type { QueryExecutor } from '../../database/database.service';

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Derived on-hand per (item, location): quantity = SUM(movement quantity), value = SUM(extended_cost),
 * weighted-average unit cost = value / quantity. Zeroed-out balances are excluded. Shared by the
 * inventory on-hand endpoint and the inventory-valuation report so both read one calculation.
 */
export async function queryInventoryOnHand(
  queryable: QueryExecutor
): Promise<InventoryOnHandRow[]> {
  const result = await queryable.query<{
    itemId: string;
    itemName: string;
    itemKind: InventoryOnHandRow['itemKind'];
    locationId: string;
    locationName: string;
    quantity: string | number;
    totalValue: string | number;
  }>(
    `select
       m.item_id as "itemId",
       it.name as "itemName",
       it.kind as "itemKind",
       m.location_id as "locationId",
       loc.name as "locationName",
       sum(m.quantity) as "quantity",
       sum(m.extended_cost) as "totalValue"
     from inventory_movements m
     join inventory_items it on it.id = m.item_id
     join inventory_locations loc on loc.id = m.location_id
     where m.location_id is not null
     group by m.item_id, it.name, it.kind, m.location_id, loc.name
     having sum(m.quantity) <> 0
     order by it.name asc, loc.name asc`
  );
  return result.rows.map((row) => {
    const quantity = Math.round(Number(row.quantity) * 10000) / 10000;
    const totalValue = roundMoney(Number(row.totalValue));
    return {
      itemId: row.itemId,
      itemName: row.itemName,
      itemKind: row.itemKind,
      locationId: row.locationId,
      locationName: row.locationName,
      quantity,
      averageUnitCost: quantity > 0 ? roundMoney(totalValue / quantity) : 0,
      totalValue
    };
  });
}
