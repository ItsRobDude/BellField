import { priceEstimate, type EstimatePricingLine } from './pricing';

describe('priceEstimate', () => {
  it('sums simple sell lines with no cost, discount, or tax', () => {
    const result = priceEstimate([
      { quantity: 2, unitPriceDollars: 50, taxable: true },
      { quantity: 1, unitPriceDollars: 25.5, taxable: false }
    ]);

    expect(result.subtotalDollars).toBe(125.5);
    expect(result.discountDollars).toBe(0);
    expect(result.discountedSubtotalDollars).toBe(125.5);
    expect(result.taxDollars).toBe(0);
    expect(result.totalDollars).toBe(125.5);
    expect(result.lines).toEqual([
      { sellTotalDollars: 100, costTotalDollars: undefined },
      { sellTotalDollars: 25.5, costTotalDollars: undefined }
    ]);
  });

  it('charges tax only on taxable lines', () => {
    const result = priceEstimate(
      [
        { quantity: 1, unitPriceDollars: 100, taxable: true },
        { quantity: 1, unitPriceDollars: 100, taxable: false }
      ],
      { taxRateBasisPoints: 825 }
    );

    // Only the taxable $100 is taxed: 100 * 8.25% = 8.25.
    expect(result.taxableBaseDollars).toBe(100);
    expect(result.taxDollars).toBe(8.25);
    expect(result.totalDollars).toBe(208.25);
  });

  it('computes the margin summary from known costs', () => {
    const result = priceEstimate([
      { quantity: 1, unitPriceDollars: 100, unitCostDollars: 60, taxable: true }
    ]);

    expect(result.margin.totalCostDollars).toBe(60);
    expect(result.margin.totalPriceDollars).toBe(100);
    expect(result.margin.profitDollars).toBe(40);
    expect(result.margin.marginBasisPoints).toBe(4000); // 40%
    expect(result.margin.costComplete).toBe(true);
  });

  it('flags an incomplete cost picture when any line is missing cost', () => {
    const result = priceEstimate([
      { quantity: 1, unitPriceDollars: 100, unitCostDollars: 60, taxable: true },
      { quantity: 1, unitPriceDollars: 50, taxable: true }
    ]);

    // Only $60 of cost is known, so the reported $90 profit is OVERSTATED (an
    // optimistic ceiling): the second line's true cost has not been subtracted.
    // costComplete is false to signal the real margin can only come out lower.
    expect(result.margin.totalCostDollars).toBe(60);
    expect(result.margin.profitDollars).toBe(90);
    expect(result.margin.costComplete).toBe(false);
  });

  it('applies a percent discount before tax and reflects it in the taxable base', () => {
    const result = priceEstimate([{ quantity: 1, unitPriceDollars: 200, taxable: true }], {
      taxRateBasisPoints: 1000,
      discount: { kind: 'percent', basisPoints: 1000 }
    });

    // 10% off $200 = $20 discount -> $180 discounted, taxable base $180,
    // tax 10% of $180 = $18, total $198.
    expect(result.discountDollars).toBe(20);
    expect(result.discountedSubtotalDollars).toBe(180);
    expect(result.taxableBaseDollars).toBe(180);
    expect(result.taxDollars).toBe(18);
    expect(result.totalDollars).toBe(198);
  });

  it('clamps a fixed discount so the subtotal cannot go negative', () => {
    const result = priceEstimate([{ quantity: 1, unitPriceDollars: 80, taxable: false }], {
      discount: { kind: 'fixed', amountDollars: 200 }
    });

    expect(result.discountDollars).toBe(80);
    expect(result.discountedSubtotalDollars).toBe(0);
    expect(result.totalDollars).toBe(0);
    // No positive price to express a margin against -> null, not a fake 0%.
    expect(result.margin.marginBasisPoints).toBeNull();
  });

  it('reports a loss, not a fake 0% margin, when a full discount zeroes a costed line', () => {
    const result = priceEstimate(
      [{ quantity: 1, unitPriceDollars: 80, unitCostDollars: 50, taxable: false }],
      {
        discount: { kind: 'fixed', amountDollars: 200 }
      }
    );

    // Price is discounted to $0 but $50 of cost was still incurred: a real $50 loss.
    expect(result.discountedSubtotalDollars).toBe(0);
    expect(result.margin.totalCostDollars).toBe(50);
    expect(result.margin.profitDollars).toBe(-50);
    // Margin ratio is undefined at $0 price; must read n/a, never 0%.
    expect(result.margin.marginBasisPoints).toBeNull();
  });

  it('reports a negative margin (without throwing) when a line is priced below cost', () => {
    const result = priceEstimate([
      { quantity: 1, unitPriceDollars: 50, unitCostDollars: 80, taxable: false }
    ]);

    // Positive price ($50) but higher cost ($80): a real -60% margin. A negative
    // basis-points value is legitimate and must not be clamped or throw.
    expect(result.margin.profitDollars).toBe(-30);
    expect(result.margin.marginBasisPoints).toBe(-6000);
  });

  it('charges tax on the taxable share of the discounted subtotal with mixed taxability', () => {
    const result = priceEstimate(
      [
        { quantity: 1, unitPriceDollars: 100, taxable: true },
        { quantity: 1, unitPriceDollars: 100, taxable: false }
      ],
      { taxRateBasisPoints: 1000, discount: { kind: 'percent', basisPoints: 1000 } }
    );

    // $200 subtotal, 10% discount -> $180 discounted. The taxable line is half the
    // subtotal, so its discounted share is $90; tax 10% of $90 = $9. Total $189.
    expect(result.discountedSubtotalDollars).toBe(180);
    expect(result.taxableBaseDollars).toBe(90);
    expect(result.taxDollars).toBe(9);
    expect(result.totalDollars).toBe(189);
  });

  it('rounds 3-decimal half-cent inputs up, honoring the half-up contract', () => {
    // Float perturbation makes e.g. 1.005 * 100 = 100.49999999999999; naive
    // rounding would drag these DOWN. They must round half-up to the next cent.
    expect(
      priceEstimate([{ quantity: 1, unitPriceDollars: 1.005, taxable: false }]).subtotalDollars
    ).toBe(1.01);
    expect(
      priceEstimate([{ quantity: 1, unitPriceDollars: 1.015, taxable: false }]).subtotalDollars
    ).toBe(1.02);
    expect(
      priceEstimate([{ quantity: 1, unitPriceDollars: 1.025, taxable: false }]).subtotalDollars
    ).toBe(1.03);
  });

  it('rounds fractional-cent line totals half-up deterministically', () => {
    // 1.5 * $19.99 = $29.985 -> rounds to $29.99.
    const result = priceEstimate([{ quantity: 1.5, unitPriceDollars: 19.99, taxable: false }]);

    expect(result.lines[0].sellTotalDollars).toBe(29.99);
    expect(result.subtotalDollars).toBe(29.99);
  });

  it('returns zeroed totals for an empty estimate', () => {
    const result = priceEstimate([]);

    expect(result.subtotalDollars).toBe(0);
    expect(result.totalDollars).toBe(0);
    expect(result.margin.profitDollars).toBe(0);
    // No price to express a margin against -> null ("n/a"), not 0%.
    expect(result.margin.marginBasisPoints).toBeNull();
    expect(result.margin.costComplete).toBe(true);
  });

  it('rejects invalid money and quantity input', () => {
    const negativePrice: EstimatePricingLine = {
      quantity: 1,
      unitPriceDollars: -5,
      taxable: true
    };
    expect(() => priceEstimate([negativePrice])).toThrow(RangeError);

    const zeroQuantity: EstimatePricingLine = {
      quantity: 0,
      unitPriceDollars: 5,
      taxable: true
    };
    expect(() => priceEstimate([zeroQuantity])).toThrow(RangeError);
  });
});
