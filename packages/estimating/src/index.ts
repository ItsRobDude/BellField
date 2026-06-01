// Public surface of the BellField estimating engine.
//
// This package is the trade-agnostic pricing core for BellField estimates. It is
// pure TypeScript with no persistence, framework, or vertical-specific knowledge
// so the same rules can run in the office app, the API, and (later) offline in
// the field. See pricing.ts for the design rationale.

export {
  priceEstimate,
  type EstimatePricingLine,
  type EstimatePricingSettings,
  type EstimateDiscount,
  type PercentDiscount,
  type FixedDiscount,
  type EstimateLineTotal,
  type EstimateMarginSummary,
  type EstimatePricingResult
} from './pricing';

export { dollarsToCents, centsToDollars, roundCents } from './money';
