import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  priceEstimate,
  type EstimateDiscount as EngineDiscount,
  type EstimatePricingLine
} from '@bellfield/estimating';
import type {
  EstimateDiscountValue,
  EstimateLineItemInputValue,
  EstimateOptionGroupInputValue,
  EstimateOptionGroupRecord,
  EstimateRecord,
  EstimateTotalsRecord
} from './estimates.types';

export function toTotalsRecordFromEngine(
  priced:
    | EstimateTotalsRecord
    | {
        subtotalDollars: number;
        discountDollars: number;
        taxableBaseDollars: number;
        taxDollars: number;
        totalDollars: number;
        margin: {
          totalCostDollars: number;
          profitDollars: number;
          marginBasisPoints: number | null;
          costComplete: boolean;
        };
      }
): EstimateTotalsRecord {
  if ('subtotal' in priced) {
    return priced;
  }
  return {
    subtotal: priced.subtotalDollars,
    discount: priced.discountDollars,
    taxableBase: priced.taxableBaseDollars,
    tax: priced.taxDollars,
    total: priced.totalDollars,
    totalCost: priced.margin.totalCostDollars,
    profit: priced.margin.profitDollars,
    marginBasisPoints: priced.margin.marginBasisPoints,
    costComplete: priced.margin.costComplete
  };
}

export function normalizeOptionGroups(
  optionGroups: EstimateOptionGroupInputValue[] | undefined
): EstimateOptionGroupInputValue[] | undefined {
  if (!optionGroups || optionGroups.length === 0) {
    return undefined;
  }

  const groupIds = new Set<string>();
  const optionIds = new Set<string>();
  return optionGroups
    .map((group) => {
      const groupId = group.id.trim();
      const title = group.title.trim();
      if (!groupId || !title) {
        throw new BadRequestException('Estimate option groups need an id and title.');
      }
      if (groupIds.has(groupId)) {
        throw new BadRequestException('Estimate option group ids must be unique.');
      }
      groupIds.add(groupId);
      if (!Array.isArray(group.options) || group.options.length < 2) {
        throw new BadRequestException('An estimate option group needs at least two options.');
      }

      const options = group.options
        .map((option) => {
          const id = option.id.trim();
          const label = option.label.trim();
          if (!id || !label) {
            throw new BadRequestException('Estimate options need an id and label.');
          }
          if (optionIds.has(id)) {
            throw new BadRequestException('Estimate option ids must be unique.');
          }
          optionIds.add(id);
          return { id, label, position: option.position };
        })
        .sort((left, right) => left.position - right.position);

      return { id: groupId, title, position: group.position, options };
    })
    .sort((left, right) => left.position - right.position);
}

export function resolveSelectedOptionForWrite(
  optionGroups: EstimateOptionGroupInputValue[] | undefined,
  selectedOptionId: string | undefined
): { id: string } | undefined {
  const trimmed = selectedOptionId?.trim();
  if (!optionGroups) {
    if (trimmed) {
      throw new BadRequestException('Selected option is only valid when option groups exist.');
    }
    return undefined;
  }
  if (!trimmed) {
    return undefined;
  }
  const option = findOption(optionGroups, trimmed);
  if (!option) {
    throw new BadRequestException('Selected estimate option was not found.');
  }
  return { id: option.id };
}

export function validateOptionLineMembership(
  lineItems: EstimateLineItemInputValue[],
  optionGroups: EstimateOptionGroupInputValue[] | undefined
): void {
  const optionsById = new Map<string, string>();
  for (const group of optionGroups ?? []) {
    for (const option of group.options) {
      optionsById.set(option.id, group.id);
    }
  }

  for (const line of lineItems) {
    const optionGroupId = line.optionGroupId?.trim();
    const optionId = line.optionId?.trim();
    if (!optionGroupId && !optionId) {
      continue;
    }
    if (!optionGroupId || !optionId) {
      throw new BadRequestException('Estimate option line needs both optionGroupId and optionId.');
    }
    if (!optionGroups) {
      throw new BadRequestException('Estimate option lines require option groups.');
    }
    if (optionsById.get(optionId) !== optionGroupId) {
      throw new BadRequestException('Estimate option line references an unknown option.');
    }
  }
}

export function priceOptionGroups(
  optionGroups: EstimateOptionGroupInputValue[],
  lineItems: EstimateLineItemInputValue[],
  taxRateBasisPoints: number,
  discount: EstimateDiscountValue | undefined
): EstimateOptionGroupRecord[] {
  const baseLines = lineItems.filter((line) => !line.optionId);
  return optionGroups.map((group) => ({
    ...group,
    options: group.options.map((option) => {
      const optionLines = lineItems.filter((line) => line.optionId === option.id);
      const priced = priceEstimate([...baseLines, ...optionLines].map(toPricingLine), {
        taxRateBasisPoints,
        discount: toEngineDiscount(discount)
      });
      return {
        ...option,
        totals: toTotalsRecordFromEngine(priced)
      };
    })
  }));
}

export function findOption<T extends { options: Array<{ id: string }> }>(
  optionGroups: T[] | undefined,
  optionId: string
): T['options'][number] | undefined {
  for (const group of optionGroups ?? []) {
    const option = group.options.find((candidate) => candidate.id === optionId);
    if (option) {
      return option;
    }
  }
  return undefined;
}

export function getConvertibleLines(estimate: EstimateRecord): EstimateRecord['lineItems'] {
  if (!estimate.optionGroups || estimate.optionGroups.length === 0) {
    return estimate.lineItems;
  }
  if (!estimate.selectedOptionId) {
    throw new ConflictException('Choose one approved estimate option before converting.');
  }
  return estimate.lineItems.filter(
    (line) => !line.optionId || line.optionId === estimate.selectedOptionId
  );
}

export function toOptionGroupInput(
  group: EstimateOptionGroupRecord
): EstimateOptionGroupInputValue {
  return {
    id: group.id,
    title: group.title,
    position: group.position,
    options: group.options.map((option) => ({
      id: option.id,
      label: option.label,
      position: option.position
    }))
  };
}

function toPricingLine(line: EstimateLineItemInputValue): EstimatePricingLine {
  return {
    quantity: line.quantity,
    unitPriceDollars: line.unitPrice,
    unitCostDollars: line.unitCost,
    taxable: line.taxable
  };
}

function toEngineDiscount(discount: EstimateDiscountValue | undefined): EngineDiscount | undefined {
  if (!discount) {
    return undefined;
  }
  if (discount.kind === 'percent') {
    return { kind: 'percent', basisPoints: discount.basisPoints };
  }
  return { kind: 'fixed', amountDollars: discount.amount };
}
