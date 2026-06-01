// Smoke test proving the API can resolve and run @bellfield/estimating.
// This guards the cross-package wiring (tsconfig path for types, jest
// moduleNameMapper for ts-jest, workspace dep for runtime) so a future breakage
// of that wiring fails here loudly rather than at production startup.
import { priceEstimate } from '@bellfield/estimating';

describe('estimating engine wiring', () => {
  it('prices a simple estimate through the shared engine', () => {
    const result = priceEstimate(
      [{ quantity: 2, unitPriceDollars: 100, unitCostDollars: 60, taxable: true }],
      { taxRateBasisPoints: 1000 }
    );

    expect(result.subtotalDollars).toBe(200);
    expect(result.taxDollars).toBe(20);
    expect(result.totalDollars).toBe(220);
    expect(result.margin.profitDollars).toBe(80);
    expect(result.margin.marginBasisPoints).toBe(4000);
  });
});
