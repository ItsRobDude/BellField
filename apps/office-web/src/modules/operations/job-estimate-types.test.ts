import { describe, expect, it } from 'vitest';
import {
  buildEstimateDraftFromSummary,
  createDefaultEstimateOptionGroup,
  createEmptyEstimateDraft,
  parseEstimateDraft,
  type EstimateDraft
} from './job-estimate-types';
import type { EstimateSummary } from '@/lib/operations-api';

function draftWith(overrides: Partial<EstimateDraft> = {}): EstimateDraft {
  return { ...createEmptyEstimateDraft(), ...overrides };
}

describe('parseEstimateDraft', () => {
  it('converts a valid draft into a request, mapping percent discounts to basis points', () => {
    const result = parseEstimateDraft(
      draftWith({
        title: '  AC replacement  ',
        discountKind: 'percent',
        discountValue: '10',
        lineItems: [
          {
            clientId: 'test-line-1',
            kind: 'equipment',
            description: 'Condenser',
            quantity: '1',
            unitOfMeasure: '',
            unitPrice: '3200',
            unitCost: '2100',
            taxable: true
          }
        ]
      })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.title).toBe('AC replacement');
    expect(result.value.taxRateBasisPoints).toBeUndefined();
    expect(result.value.discount).toEqual({ kind: 'percent', basisPoints: 1000 });
    expect(result.value.lineItems[0]).toEqual({
      kind: 'equipment',
      description: 'Condenser',
      quantity: 1,
      unitOfMeasure: undefined,
      unitPrice: 3200,
      unitCost: 2100,
      taxable: true
    });
  });

  it('treats a blank unit cost as undefined (cost optional)', () => {
    const result = parseEstimateDraft(
      draftWith({
        title: 'Quote',
        lineItems: [
          {
            clientId: 'test-line-2',
            kind: 'part',
            description: 'Capacitor',
            quantity: '1',
            unitOfMeasure: '',
            unitPrice: '120',
            unitCost: '',
            taxable: true
          }
        ]
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.lineItems[0].unitCost).toBeUndefined();
  });

  it('rejects a blank unit price instead of silently saving zero', () => {
    const result = parseEstimateDraft(
      draftWith({
        title: 'Quote',
        lineItems: [
          {
            clientId: 'test-line-3',
            kind: 'part',
            description: 'Capacitor',
            quantity: '1',
            unitOfMeasure: '',
            unitPrice: '',
            unitCost: '',
            taxable: true
          }
        ]
      })
    );

    expect(result.ok).toBe(false);
  });

  it('accepts an explicit zero unit price', () => {
    const result = parseEstimateDraft(
      draftWith({
        title: 'Quote',
        lineItems: [
          {
            clientId: 'test-line-4',
            kind: 'other',
            description: 'Courtesy inspection',
            quantity: '1',
            unitOfMeasure: '',
            unitPrice: '0',
            unitCost: '',
            taxable: false
          }
        ]
      })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.lineItems[0].unitPrice).toBe(0);
  });

  it('normalizes catalog snapshots to the edited line price and taxable value', () => {
    const result = parseEstimateDraft(
      draftWith({
        title: 'Quote',
        lineItems: [
          {
            clientId: 'test-line-5',
            kind: 'part',
            description: 'Capacitor',
            quantity: '1',
            unitOfMeasure: 'each',
            unitPrice: '150',
            unitCost: '',
            taxable: false,
            catalogItemId: 'catalog-1',
            catalogSnapshot: {
              catalogItemId: 'catalog-1',
              name: 'Capacitor',
              kind: 'part',
              taxable: true,
              priceMode: 'standard',
              selectedUnitPrice: 120
            }
          }
        ]
      })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.lineItems[0].catalogSnapshot).toMatchObject({
      selectedUnitPrice: 150,
      taxable: false,
      unitOfMeasure: 'each'
    });
  });

  it('maps a fixed discount to a dollar amount', () => {
    const result = parseEstimateDraft(
      draftWith({
        title: 'Quote',
        discountKind: 'fixed',
        discountValue: '50',
        lineItems: [
          {
            clientId: 'test-line-6',
            kind: 'part',
            description: 'X',
            quantity: '1',
            unitOfMeasure: '',
            unitPrice: '120',
            unitCost: '',
            taxable: true
          }
        ]
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.discount).toEqual({ kind: 'fixed', amount: 50 });
  });

  it('rejects an empty title', () => {
    const result = parseEstimateDraft(draftWith({ title: '   ' }));
    expect(result.ok).toBe(false);
  });

  it('rejects a line with a non-positive quantity', () => {
    const result = parseEstimateDraft(
      draftWith({
        title: 'Quote',
        lineItems: [
          {
            clientId: 'test-line-7',
            kind: 'part',
            description: 'X',
            quantity: '0',
            unitOfMeasure: '',
            unitPrice: '10',
            unitCost: '',
            taxable: true
          }
        ]
      })
    );
    expect(result.ok).toBe(false);
  });

  it('rejects a line with a missing description', () => {
    const result = parseEstimateDraft(
      draftWith({
        title: 'Quote',
        lineItems: [
          {
            clientId: 'test-line-8',
            kind: 'part',
            description: '  ',
            quantity: '1',
            unitOfMeasure: '',
            unitPrice: '10',
            unitCost: '',
            taxable: true
          }
        ]
      })
    );
    expect(result.ok).toBe(false);
  });

  it('serializes option groups and option line membership', () => {
    const optionGroup = createDefaultEstimateOptionGroup();
    const result = parseEstimateDraft(
      draftWith({
        title: 'Repair options',
        optionGroups: [optionGroup],
        selectedOptionId: 'better',
        lineItems: [
          {
            clientId: 'test-line-9',
            kind: 'serviceItem',
            description: 'Diagnostic',
            quantity: '1',
            unitOfMeasure: '',
            unitPrice: '100',
            unitCost: '',
            taxable: false
          },
          {
            clientId: 'test-line-10',
            kind: 'part',
            description: 'Better repair',
            quantity: '1',
            unitOfMeasure: '',
            unitPrice: '400',
            unitCost: '',
            taxable: false,
            optionGroupId: optionGroup.id,
            optionId: 'better'
          }
        ]
      })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.optionGroups?.[0]?.options.map((option) => option.label)).toEqual([
      'Good',
      'Better',
      'Best'
    ]);
    expect(result.value.selectedOptionId).toBe('better');
    expect(result.value.lineItems[1].optionGroupId).toBe(optionGroup.id);
    expect(result.value.lineItems[1].optionId).toBe('better');
  });

  it('rejects an option line whose option target is missing', () => {
    const optionGroup = createDefaultEstimateOptionGroup();
    const result = parseEstimateDraft(
      draftWith({
        title: 'Repair options',
        optionGroups: [optionGroup],
        lineItems: [
          {
            clientId: 'test-line-11',
            kind: 'part',
            description: 'Better repair',
            quantity: '1',
            unitOfMeasure: '',
            unitPrice: '400',
            unitCost: '',
            taxable: false,
            optionGroupId: optionGroup.id,
            optionId: 'missing'
          }
        ]
      })
    );

    expect(result.ok).toBe(false);
  });
});

describe('createEmptyEstimateDraft', () => {
  it('starts without a fake starter line', () => {
    const draft = createEmptyEstimateDraft();

    expect(draft.lineItems).toEqual([]);
    expect(parseEstimateDraft({ ...draft, title: 'Quote' })).toEqual({
      ok: false,
      message: 'Add at least one line item.'
    });
  });
});

describe('buildEstimateDraftFromSummary', () => {
  it('round-trips an estimate summary back into an editable draft', () => {
    const summary: EstimateSummary = {
      id: 'estimate-1',
      jobId: 'job-1',
      status: 'pending',
      title: 'AC replacement',
      taxRateBasisPoints: 825,
      discount: { kind: 'percent', basisPoints: 1000 },
      validUntil: '2026-07-01',
      optionGroups: [
        {
          id: 'standard-options',
          title: 'Options',
          position: 0,
          options: [
            {
              id: 'good',
              label: 'Good',
              position: 0,
              totals: {
                subtotal: 3200,
                discount: 320,
                taxableBase: 2880,
                tax: 237.6,
                total: 3117.6,
                totalCost: 2100,
                profit: 780,
                marginBasisPoints: 2708,
                costComplete: true
              }
            },
            {
              id: 'better',
              label: 'Better',
              position: 1,
              totals: {
                subtotal: 4200,
                discount: 420,
                taxableBase: 3780,
                tax: 311.85,
                total: 4091.85,
                totalCost: 2500,
                profit: 1280,
                marginBasisPoints: 3386,
                costComplete: true
              }
            }
          ]
        }
      ],
      selectedOptionId: 'good',
      lineItems: [
        {
          id: 'line-1',
          estimateId: 'estimate-1',
          position: 0,
          kind: 'equipment',
          description: 'Condenser',
          quantity: 1,
          unitPrice: 3200,
          unitCost: 2100,
          taxable: true,
          catalogItemId: 'catalog-1',
          catalogSnapshot: {
            catalogItemId: 'catalog-1',
            name: 'Condenser',
            kind: 'equipment',
            taxable: true,
            priceMode: 'standard',
            selectedUnitPrice: 3200
          },
          optionGroupId: 'standard-options',
          optionId: 'good',
          lineSubtotal: 3200,
          lineCost: 2100,
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z'
        }
      ],
      totals: {
        subtotal: 3200,
        discount: 320,
        taxableBase: 2880,
        tax: 237.6,
        total: 3117.6,
        totalCost: 2100,
        profit: 780,
        marginBasisPoints: 2708,
        costComplete: true
      },
      createdByEmployeeId: 'office-1',
      createdByName: 'Dispatcher',
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
      version: 1
    };

    const draft = buildEstimateDraftFromSummary(summary);
    expect(draft.title).toBe('AC replacement');
    expect(draft.discountKind).toBe('percent');
    expect(draft.discountValue).toBe('10');
    expect(draft.validUntil).toBe('2026-07-01');
    expect(draft.optionGroups[0].options[0].label).toBe('Good');
    expect(draft.selectedOptionId).toBe('good');
    expect(draft.lineItems[0].unitPrice).toBe('3200');
    expect(draft.lineItems[0].unitCost).toBe('2100');
    expect(draft.lineItems[0].catalogItemId).toBe('catalog-1');
    expect(draft.lineItems[0].catalogSnapshot?.name).toBe('Condenser');

    // The rebuilt draft should re-parse without error.
    const reparsed = parseEstimateDraft(draft);
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;
    expect(reparsed.value.taxRateBasisPoints).toBeUndefined();
    expect(reparsed.value.lineItems[0].catalogItemId).toBe('catalog-1');
    expect(reparsed.value.lineItems[0].catalogSnapshot?.name).toBe('Condenser');
    expect(reparsed.value.lineItems[0].optionId).toBe('good');
  });
});
