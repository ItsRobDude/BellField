// --- Inventory (Milestone 9) ----------------------------------------------------

/** A catalog item: a stocked part, or an equipment-type (serialized/trackable) item. */
export type InventoryItemKind = 'part' | 'equipment';

/**
 * Catalog identity only — NOT a stock balance. On-hand quantity and actual cost are
 * derived from the inventory movement ledger; defaultUnitCost is just a planning
 * convenience used to prefill PO lines.
 */
export interface InventoryItem {
  id: string;
  sku?: string;
  name: string;
  kind: InventoryItemKind;
  unitOfMeasure?: string;
  defaultUnitCost?: number;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateInventoryItemRequest {
  sku?: string;
  name: string;
  kind: InventoryItemKind;
  unitOfMeasure?: string;
  defaultUnitCost?: number;
  description?: string;
}

export interface UpdateInventoryItemRequest {
  sku?: string;
  name: string;
  kind: InventoryItemKind;
  unitOfMeasure?: string;
  defaultUnitCost?: number;
  description?: string;
  isActive: boolean;
}

export interface InventoryItemsResponse {
  items: InventoryItem[];
}

export interface InventoryItemResponse {
  item: InventoryItem;
}

/** A non-customer stock location: a warehouse, a technician truck/van, or other. */
export type InventoryLocationKind = 'warehouse' | 'truck' | 'other';

export interface InventoryLocation {
  id: string;
  name: string;
  kind: InventoryLocationKind;
  /** For a truck/van, the technician it belongs to (optional). */
  assignedEmployeeId?: string;
  assignedEmployeeName?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateInventoryLocationRequest {
  name: string;
  kind: InventoryLocationKind;
  assignedEmployeeId?: string;
}

export interface UpdateInventoryLocationRequest {
  name: string;
  kind: InventoryLocationKind;
  assignedEmployeeId?: string;
  isActive: boolean;
}

export interface InventoryLocationsResponse {
  locations: InventoryLocation[];
}

export interface InventoryLocationResponse {
  location: InventoryLocation;
}

// --- Inventory movements / on-hand (Milestone 9) --------------------------------

export type InventoryMovementKind =
  | 'receiveToInventory'
  | 'receiveToJob'
  | 'issueToJob'
  | 'transfer'
  | 'adjustmentGain'
  | 'adjustmentLoss'
  | 'returnFromJob';

/** A single immutable ledger entry. quantity is signed relative to its location. */
export interface InventoryMovement {
  id: string;
  itemId: string;
  itemName: string;
  kind: InventoryMovementKind;
  quantity: number;
  unitCost: number;
  locationId?: string;
  locationName?: string;
  jobId?: string;
  note?: string;
  actorName: string;
  occurredAt: string;
}

/** Derived on-hand balance for one item at one location (qty + weighted-average value). */
export interface InventoryOnHandRow {
  itemId: string;
  itemName: string;
  itemKind: InventoryItemKind;
  locationId: string;
  locationName: string;
  quantity: number;
  /** Weighted-average unit cost at this location (0 when quantity is 0). */
  averageUnitCost: number;
  totalValue: number;
}

export interface InventoryOnHandResponse {
  rows: InventoryOnHandRow[];
}

/**
 * One pickable part on a technician's truck: a structured (item, truck-location) pair with
 * its current on-hand quantity and weighted-average cost. Drives the field part-add picker
 * (Slice 1b) so a captured part can carry structured inventory refs the server auto-costs.
 */
export interface FieldTruckStockItem {
  itemId: string;
  sku?: string;
  itemName: string;
  unitOfMeasure?: string;
  locationId: string;
  locationName: string;
  quantityOnHand: number;
  averageUnitCost: number;
}

/**
 * The technician's truck-stock snapshot: every part with positive on-hand on a truck location
 * assigned to them. `snapshotVersion` lets the field app skip redundant re-caches, mirroring
 * the assigned-work snapshot. See docs/job-costing-from-field-capture-spec.md §3.
 */
export interface FieldTruckStockResponse {
  items: FieldTruckStockItem[];
  serverTime: string;
  snapshotVersion: string;
}

/**
 * Adjust on-hand at a location. quantityDelta is signed: positive = gain (found),
 * negative = loss (shrinkage/damage). A gain should carry a unitCost; a loss is valued
 * at the current average.
 */
export interface CreateInventoryAdjustmentRequest {
  itemId: string;
  locationId: string;
  quantityDelta: number;
  unitCost?: number;
  note?: string;
}

/** Move stock between two locations. Cost travels with the goods at the source average. */
export interface CreateInventoryTransferRequest {
  itemId: string;
  fromLocationId: string;
  toLocationId: string;
  quantity: number;
  note?: string;
}

/**
 * Issue stock from a location to a job (an outbound movement). The issued cost is the
 * quantity valued at the location's current weighted-average; it flows to the job's cost.
 */
export interface CreateInventoryIssueRequest {
  itemId: string;
  locationId: string;
  jobId: string;
  quantity: number;
  note?: string;
}

export interface InventoryMovementResponse {
  movements: InventoryMovement[];
}
