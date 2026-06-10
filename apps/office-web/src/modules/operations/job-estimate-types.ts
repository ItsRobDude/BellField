import type {
  CatalogLineSnapshot,
  CreateEstimateRequest,
  EstimateLineItemKind,
  EstimateOptionGroupInput,
  EstimateStatus,
  EstimateSummary
} from '@/lib/operations-api';

export const defaultEstimateOptionGroupId = 'standard-options';

export const defaultEstimateOptions = [
  { id: 'good', label: 'Good', position: 0 },
  { id: 'better', label: 'Better', position: 1 },
  { id: 'best', label: 'Best', position: 2 }
] as const;

export type EstimateOptionDraft = {
  id: string;
  label: string;
  position: number;
};

export type EstimateOptionGroupDraft = {
  id: string;
  title: string;
  position: number;
  options: EstimateOptionDraft[];
};

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
  catalogItemId?: string;
  catalogSnapshot?: CatalogLineSnapshot;
  optionGroupId?: string;
  optionId?: string;
};

export type EstimateDraft = {
  title: string;
  discountKind: 'none' | 'percent' | 'fixed';
  discountValue: string;
  validUntil: string;
  optionGroups: EstimateOptionGroupDraft[];
  selectedOptionId: string;
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
  membership: 'Agreement',
  other: 'Other'
};

export function createEmptyEstimateDraft(): EstimateDraft {
  return {
    title: '',
    discountKind: 'none',
    discountValue: '',
    validUntil: '',
    optionGroups: [],
    selectedOptionId: '',
    lineItems: [
      {
        kind: 'serviceItem',
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

export function isUntouchedBlankEstimateLine(line: EstimateLineDraft): boolean {
  return (
    line.kind === 'serviceItem' &&
    line.description.trim() === '' &&
    line.quantity === '1' &&
    line.unitOfMeasure.trim() === '' &&
    line.unitPrice.trim() === '' &&
    line.unitCost.trim() === '' &&
    line.taxable &&
    !line.catalogItemId &&
    !line.catalogSnapshot &&
    !line.optionGroupId &&
    !line.optionId
  );
}

export function buildEstimateDraftFromSummary(estimate: EstimateSummary): EstimateDraft {
  return {
    title: estimate.title,
    discountKind: estimate.discount?.kind ?? 'none',
    discountValue: estimate.discount
      ? estimate.discount.kind === 'percent'
        ? basisPointsToPercentString(estimate.discount.basisPoints)
        : String(estimate.discount.amount)
      : '',
    validUntil: estimate.validUntil ?? '',
    optionGroups:
      estimate.optionGroups?.map((group) => ({
        id: group.id,
        title: group.title,
        position: group.position,
        options: group.options.map((option) => ({
          id: option.id,
          label: option.label,
          position: option.position
        }))
      })) ?? [],
    selectedOptionId: estimate.selectedOptionId ?? '',
    lineItems: estimate.lineItems.map((line) => ({
      kind: line.kind,
      description: line.description,
      quantity: String(line.quantity),
      unitOfMeasure: line.unitOfMeasure ?? '',
      unitPrice: String(line.unitPrice),
      unitCost: line.unitCost === undefined ? '' : String(line.unitCost),
      taxable: line.taxable,
      catalogItemId: line.catalogItemId,
      catalogSnapshot: line.catalogSnapshot,
      optionGroupId: line.optionGroupId,
      optionId: line.optionId
    }))
  };
}

type ParseResult = { ok: true; value: CreateEstimateRequest } | { ok: false; message: string };

/**
 * Validate and convert the editor draft into a create/update request body. The
 * server owns estimate-level tax defaults and re-prices authoritatively, so this
 * only needs to produce a well-formed request.
 */
export function parseEstimateDraft(draft: EstimateDraft): ParseResult {
  const title = draft.title.trim();
  if (!title) {
    return { ok: false, message: 'Enter an estimate title.' };
  }
  if (draft.lineItems.length === 0) {
    return { ok: false, message: 'Add at least one line item.' };
  }

  const lineItems: CreateEstimateRequest['lineItems'] = [];
  const optionGroups = parseOptionGroups(draft.optionGroups);
  if (!optionGroups.ok) {
    return optionGroups;
  }
  if (draft.selectedOptionId && !findOption(optionGroups.value, draft.selectedOptionId)) {
    return { ok: false, message: 'Selected option was not found.' };
  }
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
    const unitPriceText = line.unitPrice.trim();
    if (unitPriceText === '') {
      return { ok: false, message: `Line ${position}: enter a unit price.` };
    }
    const unitPrice = Number(unitPriceText);
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

    const lineInput: CreateEstimateRequest['lineItems'][number] = {
      kind: line.kind,
      description,
      quantity,
      unitOfMeasure: line.unitOfMeasure.trim() || undefined,
      unitPrice,
      unitCost,
      taxable: line.taxable
    };
    if (line.optionGroupId || line.optionId) {
      if (!line.optionGroupId || !line.optionId) {
        return { ok: false, message: `Line ${position}: choose a complete option target.` };
      }
      if (!findOption(optionGroups.value, line.optionId, line.optionGroupId)) {
        return { ok: false, message: `Line ${position}: option target was not found.` };
      }
      lineInput.optionGroupId = line.optionGroupId;
      lineInput.optionId = line.optionId;
    }
    if (line.catalogItemId) {
      lineInput.catalogItemId = line.catalogItemId;
    }
    if (line.catalogSnapshot) {
      const catalogSnapshot = {
        ...line.catalogSnapshot,
        selectedUnitPrice: unitPrice,
        taxable: line.taxable
      };
      const unitOfMeasure = line.unitOfMeasure.trim();
      if (unitOfMeasure) {
        catalogSnapshot.unitOfMeasure = unitOfMeasure;
      } else {
        delete catalogSnapshot.unitOfMeasure;
      }
      lineInput.catalogSnapshot = catalogSnapshot;
    }
    lineItems.push(lineInput);
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
      discount,
      validUntil: draft.validUntil || undefined,
      optionGroups: optionGroups.value.length > 0 ? optionGroups.value : undefined,
      selectedOptionId: draft.selectedOptionId || undefined,
      lineItems
    }
  };
}

export function createDefaultEstimateOptionGroup(): EstimateOptionGroupDraft {
  return {
    id: defaultEstimateOptionGroupId,
    title: 'Options',
    position: 0,
    options: defaultEstimateOptions.map((option) => ({ ...option }))
  };
}

function parseOptionGroups(
  groups: EstimateOptionGroupDraft[]
): { ok: true; value: EstimateOptionGroupInput[] } | { ok: false; message: string } {
  const groupIds = new Set<string>();
  const optionIds = new Set<string>();
  const parsedGroups: EstimateOptionGroupInput[] = [];
  for (const group of groups) {
    const id = group.id.trim();
    const title = group.title.trim();
    if (!id || !title) {
      return { ok: false, message: 'Option groups need a title.' };
    }
    if (groupIds.has(id)) {
      return { ok: false, message: 'Option group ids must be unique.' };
    }
    groupIds.add(id);
    if (group.options.length < 2) {
      return { ok: false, message: 'Add at least two options or remove the option group.' };
    }
    const options = [];
    for (const option of group.options) {
      const optionId = option.id.trim();
      const label = option.label.trim();
      if (!optionId || !label) {
        return { ok: false, message: 'Option labels are required.' };
      }
      if (optionIds.has(optionId)) {
        return { ok: false, message: 'Option ids must be unique.' };
      }
      optionIds.add(optionId);
      options.push({ id: optionId, label, position: option.position });
    }
    parsedGroups.push({ id, title, position: group.position, options });
  }
  return { ok: true, value: parsedGroups };
}

function findOption(
  groups: EstimateOptionGroupInput[],
  optionId: string,
  optionGroupId?: string
): boolean {
  return groups.some(
    (group) =>
      (!optionGroupId || group.id === optionGroupId) &&
      group.options.some((option) => option.id === optionId)
  );
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
