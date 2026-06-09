import type {
  AppointmentFinishOutcome,
  AppointmentStatus,
  EquipmentStatus,
  FieldAssignedWorkResponse,
  FieldCatalogItem,
  RegisterCatalogSnapshot,
  RegisterEntryKind
} from '@/lib/operations-api';

export type EquipmentDraft = {
  model: string;
  serialNumber: string;
  filterSizes: string;
  equipmentLocationDescription: string;
  installDate: string;
  status: EquipmentStatus;
  notes: string;
};

export type EquipmentCreateDraft = {
  equipmentType: string;
  brand: string;
  model: string;
  serialNumber: string;
  filterSizes: string;
  equipmentLocationDescription: string;
  installDate: string;
  warrantyStartDate: string;
  warrantyEndDate: string;
  warrantyProviderNote: string;
  systemGroupName: string;
  status: EquipmentStatus;
  notes: string;
};

export type RegisterEntryDraft = {
  appointmentId: string;
  registerEntryKind: RegisterEntryKind;
  description: string;
  quantity: string;
  unitOfMeasure: string;
  unitPrice: string;
  totalAmount: string;
  partNumber: string;
  inventorySourceLabel: string;
  /** Structured truck stock the tech picked (Slice 1b). Set together for a `part` line so the
   * server auto-costs it as a tracked-inventory issue; empty when capturing free-text. */
  inventoryItemId: string;
  inventoryLocationId: string;
  catalogItemId: string;
  catalogSnapshot?: RegisterCatalogSnapshot;
};

export type FinishReviewState = {
  jobId: string;
  appointmentId: string;
  visitNotes: string;
  finishOutcome: AppointmentFinishOutcome;
  hasChargeActivity: boolean;
  registerReminder: string;
};

export function createEquipmentDraft(
  record: FieldAssignedWorkResponse['equipment'][number]
): EquipmentDraft {
  return {
    model: record.model,
    serialNumber: record.serialNumber,
    filterSizes: record.filterSizes.join(', '),
    equipmentLocationDescription: record.equipmentLocationDescription ?? '',
    installDate: record.installDate ?? '',
    status: record.status,
    notes: record.notes
  };
}

export function createEquipmentCreateDraft(): EquipmentCreateDraft {
  return {
    equipmentType: 'Condenser',
    brand: 'Carrier',
    model: '',
    serialNumber: '',
    filterSizes: '16x25x1',
    equipmentLocationDescription: '',
    installDate: '',
    warrantyStartDate: '',
    warrantyEndDate: '',
    warrantyProviderNote: '',
    systemGroupName: '',
    status: 'active',
    notes: ''
  };
}

export function createRegisterEntryDraft(
  entry?: Partial<NonNullable<FieldAssignedWorkResponse['jobs'][number]['registerEntries']>[number]>
): RegisterEntryDraft {
  return {
    appointmentId: entry?.appointmentId ?? '',
    registerEntryKind: entry?.kind ?? 'part',
    description: entry?.description ?? '',
    quantity: entry?.quantity !== undefined ? String(entry.quantity) : '1',
    unitOfMeasure: entry?.unitOfMeasure ?? 'each',
    unitPrice: entry?.unitPrice !== undefined ? String(entry.unitPrice) : '',
    totalAmount: entry?.totalAmount !== undefined ? String(entry.totalAmount) : '',
    partNumber: entry?.partNumber ?? '',
    inventorySourceLabel: entry?.inventorySourceLabel ?? '',
    inventoryItemId: entry?.inventoryItemId ?? '',
    inventoryLocationId: entry?.inventoryLocationId ?? '',
    catalogItemId: entry?.catalogItemId ?? '',
    catalogSnapshot: entry?.catalogSnapshot
  };
}

export function createCatalogRegisterDraftPatch(
  item: FieldCatalogItem,
  truckStockItems: {
    itemId: string;
    sku?: string;
    locationId: string;
    locationName: string;
    unitOfMeasure?: string;
  }[]
): Partial<RegisterEntryDraft> {
  const registerEntryKind = mapCatalogKindToRegisterEntryKind(item.kind);
  const unitPrice = item.defaultSalePrice ?? 0;
  const truckMatch = item.linkedInventoryItemId
    ? truckStockItems.find((stockItem) => stockItem.itemId === item.linkedInventoryItemId)
    : undefined;
  const catalogSnapshot: RegisterCatalogSnapshot = {
    catalogItemId: item.id,
    code: item.code,
    name: item.name,
    kind: item.kind,
    category: item.category,
    description: item.description,
    unitOfMeasure: item.unitOfMeasure,
    selectedUnitPrice: item.defaultSalePrice,
    taxable: item.taxableDefault,
    priceMode: 'standard',
    defaultSalePrice: item.defaultSalePrice,
    agreementPrice: item.agreementPrice,
    estimatedLaborHours: item.estimatedLaborHours,
    linkedInventoryItemId: item.linkedInventoryItemId,
    linkedInventoryItemSku: item.linkedInventoryItemSku,
    linkedInventoryItemName: item.linkedInventoryItemName
  };

  return {
    registerEntryKind,
    description: item.description || item.name,
    quantity: '1',
    unitOfMeasure: item.unitOfMeasure ?? 'each',
    unitPrice: item.defaultSalePrice === undefined ? '' : String(item.defaultSalePrice),
    totalAmount: String(unitPrice),
    partNumber: item.code ?? item.linkedInventoryItemSku ?? '',
    inventoryItemId: truckMatch && registerEntryKind === 'part' ? truckMatch.itemId : '',
    inventoryLocationId: truckMatch && registerEntryKind === 'part' ? truckMatch.locationId : '',
    inventorySourceLabel: truckMatch && registerEntryKind === 'part' ? truckMatch.locationName : '',
    catalogItemId: item.id,
    catalogSnapshot
  };
}

export function buildPricedRegisterDraftPatch(
  draft: RegisterEntryDraft,
  patch: Partial<Pick<RegisterEntryDraft, 'quantity' | 'unitPrice'>>
): Partial<RegisterEntryDraft> {
  const quantity = patch.quantity ?? draft.quantity;
  const unitPrice = patch.unitPrice ?? draft.unitPrice;
  const totalAmount = calculateDraftLineTotal(quantity, unitPrice);

  return {
    ...patch,
    ...(totalAmount === null ? {} : { totalAmount })
  };
}

export function calculateDraftLineTotal(
  quantityValue: string,
  unitPriceValue: string
): string | null {
  const quantity = Number(quantityValue);
  const unitPrice = Number(unitPriceValue);

  if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) {
    return null;
  }

  return formatDraftNumber(quantity * unitPrice);
}

export function formatDraftNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return '';
  }

  return String(Math.round(value * 100) / 100);
}

export function parseRegisterEntryDraft(
  draft: RegisterEntryDraft,
  allowClearedUnitPrice: boolean
):
  | {
      ok: true;
      value: {
        description: string;
        quantity: number;
        unitOfMeasure?: string;
        unitPrice?: number | null;
        totalAmount: number;
        partNumber?: string;
        inventorySourceLabel?: string;
        inventoryItemId?: string;
        inventoryLocationId?: string;
        catalogItemId?: string;
        catalogSnapshot?: RegisterCatalogSnapshot;
      };
    }
  | { ok: false; message: string } {
  const description = draft.description.trim();
  const quantity = Number(draft.quantity);
  const unitPrice = draft.unitPrice.trim()
    ? Number(draft.unitPrice)
    : allowClearedUnitPrice
      ? null
      : undefined;
  const totalAmount = Number(draft.totalAmount);

  if (!description) {
    return { ok: false, message: 'Register entry description is required.' };
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { ok: false, message: 'Register entry quantity must be greater than zero.' };
  }

  if (
    unitPrice !== undefined &&
    unitPrice !== null &&
    (!Number.isFinite(unitPrice) || unitPrice < 0)
  ) {
    return { ok: false, message: 'Register entry unit price cannot be negative.' };
  }

  if (!Number.isFinite(totalAmount) || totalAmount < 0) {
    return { ok: false, message: 'Register entry total amount cannot be negative.' };
  }

  // Structured truck refs only ride along on a part line and only as a complete pair — the
  // server auto-costs (issue-to-job) when both are present, so a lone id would be meaningless.
  const inventoryItemId = draft.inventoryItemId.trim();
  const inventoryLocationId = draft.inventoryLocationId.trim();
  const hasStructuredRefs =
    draft.registerEntryKind === 'part' && !!inventoryItemId && !!inventoryLocationId;

  return {
    ok: true,
    value: {
      description,
      quantity,
      unitOfMeasure: draft.unitOfMeasure.trim() || undefined,
      unitPrice,
      totalAmount,
      partNumber: draft.partNumber.trim() || undefined,
      inventorySourceLabel: draft.inventorySourceLabel.trim() || undefined,
      inventoryItemId: hasStructuredRefs ? inventoryItemId : undefined,
      inventoryLocationId: hasStructuredRefs ? inventoryLocationId : undefined,
      catalogItemId: draft.catalogItemId.trim() || undefined,
      catalogSnapshot: draft.catalogSnapshot
    }
  };
}

export function mapCatalogKindToRegisterEntryKind(
  kind: FieldCatalogItem['kind']
): RegisterEntryKind {
  if (kind === 'service') {
    return 'serviceItem';
  }

  if (kind === 'part' || kind === 'equipment') {
    return 'part';
  }

  if (kind === 'agreement') {
    return 'membership';
  }

  if (kind === 'labor') {
    return 'labor';
  }

  return 'other';
}

export function formatAppointmentStatusLabel(status: AppointmentStatus): string {
  if (status === 'onTheWay') {
    return 'on the way';
  }

  if (status === 'noAnswer') {
    return 'no answer';
  }

  return status;
}

export function formatRegisterEntryKind(kind: RegisterEntryKind): string {
  if (kind === 'serviceItem') {
    return 'Service item';
  }

  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

export function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function isLocalRegisterEntry(
  entry: NonNullable<FieldAssignedWorkResponse['jobs'][number]['registerEntries']>[number]
): boolean {
  return entry.capturedByEmployeeId === 'local-device' || entry.id.endsWith('-local');
}
