import { describe, expect, it } from 'vitest';
import {
  buildEstimateDraftFromSummary,
  createEmptyEstimateDraft,
  parseEstimateDraft,
  type EstimateDraft
} from './job-estimate-types';
import type { EstimateSummary } from '@/lib/operations-api';

function draftWith(overrides: Partial<EstimateDraft> = {}): EstimateDraft {
  return { ...createEmptyEstimateDraft(), ...overrides };
}

describe('parseEstimateDraft', () => {
  it('converts a valid draft into a request, mapping percent fields to basis points', () => {
    const result = parseEstimateDraft(
      draftWith({
        title: '  AC replacement  ',
        taxRatePercent: '8.25',
        discountKind: 'percent',
        discountValue: '10',
        lineItems: [
          {
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
    expect(result.value.taxRateBasisPoints).toBe(825);
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

  it('maps a fixed discount to a dollar amount', () => {
    const result = parseEstimateDraft(
      draftWith({
        title: 'Quote',
        discountKind: 'fixed',
        discountValue: '50',
        lineItems: [
          {
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
    expect(draft.taxRatePercent).toBe('8.25');
    expect(draft.discountKind).toBe('percent');
    expect(draft.discountValue).toBe('10');
    expect(draft.validUntil).toBe('2026-07-01');
    expect(draft.lineItems[0].unitPrice).toBe('3200');
    expect(draft.lineItems[0].unitCost).toBe('2100');
    expect(draft.lineItems[0].catalogItemId).toBe('catalog-1');
    expect(draft.lineItems[0].catalogSnapshot?.name).toBe('Condenser');

    // The rebuilt draft should re-parse without error.
    const reparsed = parseEstimateDraft(draft);
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;
    expect(reparsed.value.lineItems[0].catalogItemId).toBe('catalog-1');
    expect(reparsed.value.lineItems[0].catalogSnapshot?.name).toBe('Condenser');
  });
});
