import type {
  CreateEstimateRequest,
  EstimateLineItemKind,
  EstimateStatus,
  EstimateSummary
} from '@/lib/operations-api';

// String-backed draft shapes for the estimate editor. Money/number fields are
// kept as strings while editing (matching the register-entry editor) and parsed
// to numbers only on save.
export type EstimateLineDraft = {
  kind: EstimateLineItemKind;
  description: string;
  quantity: string;
  unitOfMeasure: string;
  unitPrice: string;
  unitCost: string;
  taxable: boolean;
};

export type EstimateDraft = {
  title: string;
  taxRatePercent: string;
  discountKind: 'none' | 'percent' | 'fixed';
  discountValue: string;
  validUntil: string;
  lineItems: EstimateLineDraft[];
};

export const estimateStatusLabels: Record<EstimateStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  declined: 'Declined'
};

export const estimateLineItemKindOptions: EstimateLineItemKind[] = [
  'labor',
  'serviceItem',
  'part',
  'equipment',
  'membership',
  'other'
];

export const estimateLineItemKindLabels: Record<EstimateLineItemKind, string> = {
  labor: 'Labor',
  serviceItem: 'Service item',
  part: 'Part',
  equipment: 'Equipment',
  membership: 'Membership',
  other: 'Other'
};

export function createEmptyEstimateDraft(): EstimateDraft {
  return {
    title: '',
    taxRatePercent: '',
    discountKind: 'none',
    discountValue: '',
    validUntil: '',
    lineItems: [
      {
        kind: 'part',
        description: '',
        quantity: '1',
        unitOfMeasure: '',
        unitPrice: '',
        unitCost: '',
        taxable: true
      }
    ]
  };
}

export function buildEstimateDraftFromSummary(estimate: EstimateSummary): EstimateDraft {
  return {
    title: estimate.title,
    taxRatePercent: basisPointsToPercentString(estimate.taxRateBasisPoints),
    discountKind: estimate.discount?.kind ?? 'none',
    discountValue: estimate.discount
      ? estimate.discount.kind === 'percent'
        ? basisPointsToPercentString(estimate.discount.basisPoints)
        : String(estimate.discount.amount)
      : '',
    validUntil: estimate.validUntil ?? '',
    lineItems: estimate.lineItems.map((line) => ({
      kind: line.kind,
      description: line.description,
      quantity: String(line.quantity),
      unitOfMeasure: line.unitOfMeasure ?? '',
      unitPrice: String(line.unitPrice),
      unitCost: line.unitCost === undefined ? '' : String(line.unitCost),
      taxable: line.taxable
    }))
  };
}

type ParseResult = { ok: true; value: CreateEstimateRequest } | { ok: false; message: string };

/**
 * Validate and convert the editor draft into a create/update request body. Tax
 * and percent discounts are entered as human percentages and converted to basis
 * points; the server re-prices authoritatively, so this only needs to produce a
 * well-formed request.
 */
export function parseEstimateDraft(draft: EstimateDraft): ParseResult {
  const title = draft.title.trim();
  if (!title) {
    return { ok: false, message: 'Enter an estimate title.' };
  }
  if (draft.lineItems.length === 0) {
    return { ok: false, message: 'Add at least one line item.' };
  }

  const taxRateBasisPoints = percentStringToBasisPoints(draft.taxRatePercent);
  if (taxRateBasisPoints === null) {
    return { ok: false, message: 'Tax rate must be a number of zero or more.' };
  }

  const lineItems: CreateEstimateRequest['lineItems'] = [];
  for (let index = 0; index < draft.lineItems.length; index += 1) {
    const line = draft.lineItems[index];
    const position = index + 1;
    const description = line.description.trim();
    if (!description) {
      return { ok: false, message: `Line ${position}: enter a description.` };
    }
    const quantity = Number(line.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { ok: false, message: `Line ${position}: quantity must be greater than zero.` };
    }
    const unitPrice = Number(line.unitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      return { ok: false, message: `Line ${position}: unit price must be zero or more.` };
    }
    let unitCost: number | undefined;
    if (line.unitCost.trim() !== '') {
      const parsedCost = Number(line.unitCost);
      if (!Number.isFinite(parsedCost) || parsedCost < 0) {
        return { ok: false, message: `Line ${position}: unit cost must be zero or more.` };
      }
      unitCost = parsedCost;
    }

    lineItems.push({
      kind: line.kind,
      description,
      quantity,
      unitOfMeasure: line.unitOfMeasure.trim() || undefined,
      unitPrice,
      unitCost,
      taxable: line.taxable
    });
  }

  let discount: CreateEstimateRequest['discount'];
  if (draft.discountKind === 'percent') {
    const basisPoints = percentStringToBasisPoints(draft.discountValue);
    if (basisPoints === null) {
      return { ok: false, message: 'Percent discount must be a number of zero or more.' };
    }
    discount = { kind: 'percent', basisPoints };
  } else if (draft.discountKind === 'fixed') {
    const amount = Number(draft.discountValue);
    if (!Number.isFinite(amount) || amount < 0) {
      return { ok: false, message: 'Fixed discount must be a dollar amount of zero or more.' };
    }
    discount = { kind: 'fixed', amount };
  }

  return {
    ok: true,
    value: {
      title,
      taxRateBasisPoints,
      discount,
      validUntil: draft.validUntil || undefined,
      lineItems
    }
  };
}

function percentStringToBasisPoints(value: string): number | null {
  if (value.trim() === '') {
    return 0;
  }
  const percent = Number(value);
  if (!Number.isFinite(percent) || percent < 0) {
    return null;
  }
  return Math.round(percent * 100);
}

function basisPointsToPercentString(basisPoints: number): string {
  return String(basisPoints / 100);
}
