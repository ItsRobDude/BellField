import type {
  InvoiceLineItemInput,
  InvoiceLineItemKind,
  InvoiceLineItemSummary
} from '@/lib/operations-api';

// String-backed draft for the invoice line editor; numbers stay strings while
// editing (matching the register/estimate editors) and parse on save.
export type InvoiceLineDraft = {
  kind: InvoiceLineItemKind;
  description: string;
  quantity: string;
  unitOfMeasure: string;
  unitPrice: string;
  unitCost: string;
  taxable: boolean;
};

export const invoiceLineKindOptions: InvoiceLineItemKind[] = [
  'labor',
  'serviceItem',
  'part',
  'equipment',
  'membership',
  'other'
];

export const invoiceLineKindLabels: Record<InvoiceLineItemKind, string> = {
  labor: 'Labor',
  serviceItem: 'Service item',
  part: 'Part',
  equipment: 'Equipment',
  membership: 'Agreement',
  other: 'Other'
};

export function createEmptyInvoiceLineDraft(): InvoiceLineDraft {
  return {
    kind: 'serviceItem',
    description: '',
    quantity: '1',
    unitOfMeasure: '',
    unitPrice: '',
    unitCost: '',
    taxable: true
  };
}

export function buildInvoiceLineDraft(line: InvoiceLineItemSummary): InvoiceLineDraft {
  return {
    kind: line.kind,
    description: line.description,
    quantity: String(line.quantity),
    unitOfMeasure: line.unitOfMeasure ?? '',
    unitPrice: String(line.unitPrice),
    unitCost: line.unitCost === undefined ? '' : String(line.unitCost),
    taxable: line.taxable
  };
}

type ParseResult = { ok: true; value: InvoiceLineItemInput } | { ok: false; message: string };

export function parseInvoiceLineDraft(draft: InvoiceLineDraft): ParseResult {
  const description = draft.description.trim();
  if (!description) {
    return { ok: false, message: 'Enter a line description.' };
  }
  const quantity = Number(draft.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { ok: false, message: 'Quantity must be greater than zero.' };
  }
  const unitPrice = Number(draft.unitPrice);
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    return { ok: false, message: 'Unit price must be zero or more.' };
  }
  let unitCost: number | undefined;
  if (draft.unitCost.trim() !== '') {
    const parsedCost = Number(draft.unitCost);
    if (!Number.isFinite(parsedCost) || parsedCost < 0) {
      return { ok: false, message: 'Unit cost must be zero or more.' };
    }
    unitCost = parsedCost;
  }

  return {
    ok: true,
    value: {
      kind: draft.kind,
      description,
      quantity,
      unitOfMeasure: draft.unitOfMeasure.trim() || undefined,
      unitPrice,
      unitCost,
      taxable: draft.taxable
    }
  };
}
