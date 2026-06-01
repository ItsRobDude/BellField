// Estimate pricing engine for BellField.
//
// This is the trade-agnostic core distilled from BidRivet's estimating pipeline:
// raw cost -> sell price -> discount -> tax, with a margin/profit summary for the
// owner. Deliberately, it knows nothing about HVACR scope flags, labor profiles,
// pricing buckets, or commission. Those richer, vertical-specific concepts belong
// in a later "trade template pack" layer that produces the simple priced lines
// this engine consumes. Keeping the core this small is what lets BellField serve
// trades broadly instead of inheriting one vertical's assumptions.
//
// The engine is a pure function: same input always yields the same output, no I/O,
// no dependency on persistence. That is what makes it safe to run on the office
// web app, inside the API, and (later) offline on a field device against the same
// rules.

import { centsToDollars, dollarsToCents, roundCents } from './money';

const BASIS_POINTS_DIVISOR = 10000;

/**
 * A single priced line as the engine sees it. Pricing only depends on the money
 * fields, so the engine intentionally does not carry a line "kind", description,
 * or any other display metadata — the caller owns those. `unitCost` is optional
 * because cost is for internal profit visibility and may simply be unknown when a
 * line is quoted.
 */
export interface EstimatePricingLine {
  /** Units quoted. Must be greater than zero. */
  readonly quantity: number;
  /** Customer-facing sell price per unit, in dollars. Must be >= 0. */
  readonly unitPriceDollars: number;
  /** Internal cost per unit, in dollars, when known. Must be >= 0 when present. */
  readonly unitCostDollars?: number;
  /** Whether this line participates in the taxable base. */
  readonly taxable: boolean;
}

/** A percent discount expressed in basis points (e.g. 1000 = 10%). */
export interface PercentDiscount {
  readonly kind: 'percent';
  readonly basisPoints: number;
}

/** A flat discount expressed in dollars. Clamped so it can never exceed subtotal. */
export interface FixedDiscount {
  readonly kind: 'fixed';
  readonly amountDollars: number;
}

export type EstimateDiscount = PercentDiscount | FixedDiscount;

export interface EstimatePricingSettings {
  /** Sales tax rate in basis points (e.g. 825 = 8.25%). Defaults to 0 when omitted. */
  readonly taxRateBasisPoints?: number;
  /** Optional whole-estimate discount applied before tax. */
  readonly discount?: EstimateDiscount;
}

/** Per-line money results, in the same order as the input lines. */
export interface EstimateLineTotal {
  readonly sellTotalDollars: number;
  /** Present only when the line carried a known unit cost. */
  readonly costTotalDollars?: number;
}

/**
 * Owner-facing profit summary. `totalPrice` is the pre-tax sell amount after any
 * discount (tax is a pass-through, never counted as margin).
 *
 * `costComplete` is false when at least one line is missing a cost. In that case
 * the unknown costs are simply not subtracted, so `profit` and `marginBasisPoints`
 * are OVERSTATED — an optimistic ceiling, not a floor. The true margin can only be
 * equal to or lower than what is reported, never higher, because filling in the
 * missing costs can only add to total cost. Any UI must surface this flag so an
 * optimistic number is never read as exact. (Reporting the partial figure with a
 * flag still beats silently treating un-costed lines as $0 cost, which would
 * overstate margin with no signal at all.)
 *
 * `marginBasisPoints` is null when there is no positive price to express a margin
 * against (an empty estimate, or a discount that zeroes the price). Margin is
 * profit ÷ price; with price 0 that ratio is undefined, so we return null ("n/a")
 * rather than a fake 0%. This matters because the price can be zero while a real
 * cost was incurred — `profitDollars` then correctly shows a loss, and a 0% reading
 * beside a negative profit would be self-contradictory and understate the loss.
 */
export interface EstimateMarginSummary {
  readonly totalCostDollars: number;
  readonly totalPriceDollars: number;
  readonly profitDollars: number;
  readonly marginBasisPoints: number | null;
  readonly costComplete: boolean;
}

export interface EstimatePricingResult {
  readonly lines: readonly EstimateLineTotal[];
  /** Sum of line sell totals before discount and tax. */
  readonly subtotalDollars: number;
  /** Discount amount actually applied (clamped to the subtotal). */
  readonly discountDollars: number;
  /** Subtotal after discount, before tax. */
  readonly discountedSubtotalDollars: number;
  /** Taxable portion of the discounted subtotal that tax was charged on. */
  readonly taxableBaseDollars: number;
  readonly taxDollars: number;
  /** Final amount due: discounted subtotal plus tax. */
  readonly totalDollars: number;
  readonly margin: EstimateMarginSummary;
}

function lineSellCents(line: EstimatePricingLine): number {
  if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
    throw new RangeError('Estimate line quantity must be greater than zero.');
  }
  const unitPriceCents = dollarsToCents(line.unitPriceDollars);
  return roundCents(line.quantity * unitPriceCents);
}

function lineCostCents(line: EstimatePricingLine): number | undefined {
  if (line.unitCostDollars === undefined) {
    return undefined;
  }
  const unitCostCents = dollarsToCents(line.unitCostDollars);
  return roundCents(line.quantity * unitCostCents);
}

function discountCents(subtotalCents: number, discount: EstimateDiscount | undefined): number {
  if (!discount) {
    return 0;
  }
  if (discount.kind === 'percent') {
    if (!Number.isFinite(discount.basisPoints) || discount.basisPoints < 0) {
      throw new RangeError('Discount basis points must be zero or greater.');
    }
    // A percent discount can't sensibly exceed 100%; clamp so the math stays sane.
    const cappedBasisPoints = Math.min(discount.basisPoints, BASIS_POINTS_DIVISOR);
    return roundCents((subtotalCents * cappedBasisPoints) / BASIS_POINTS_DIVISOR);
  }
  // Fixed discount: never let it drive the subtotal below zero.
  return Math.min(dollarsToCents(discount.amountDollars), subtotalCents);
}

/**
 * Price an estimate from its lines and settings. Pure and deterministic.
 *
 * Throws RangeError on invalid input (negative or non-finite money, non-positive
 * quantity). Callers are expected to validate user input before pricing; a thrown
 * error here means a real programming or data-integrity bug, which is preferable
 * to a silently wrong total on something that feeds an invoice.
 */
export function priceEstimate(
  lines: readonly EstimatePricingLine[],
  settings: EstimatePricingSettings = {}
): EstimatePricingResult {
  const taxRateBasisPoints = settings.taxRateBasisPoints ?? 0;
  if (!Number.isFinite(taxRateBasisPoints) || taxRateBasisPoints < 0) {
    throw new RangeError('Tax rate basis points must be zero or greater.');
  }

  const lineTotals: EstimateLineTotal[] = [];
  let subtotalCents = 0;
  let taxableSellCents = 0;
  let knownCostCents = 0;
  let costComplete = true;

  for (const line of lines) {
    const sellCents = lineSellCents(line);
    const costCents = lineCostCents(line);

    subtotalCents += sellCents;
    if (line.taxable) {
      taxableSellCents += sellCents;
    }
    if (costCents === undefined) {
      costComplete = false;
    } else {
      knownCostCents += costCents;
    }

    lineTotals.push({
      sellTotalDollars: centsToDollars(sellCents),
      costTotalDollars: costCents === undefined ? undefined : centsToDollars(costCents)
    });
  }

  const appliedDiscountCents = discountCents(subtotalCents, settings.discount);
  const discountedSubtotalCents = subtotalCents - appliedDiscountCents;

  // Allocate the discount proportionally so tax is charged on the taxable share of
  // the *discounted* subtotal, not the pre-discount amount.
  const taxableBaseCents =
    subtotalCents > 0
      ? roundCents((taxableSellCents * discountedSubtotalCents) / subtotalCents)
      : 0;
  const taxCents = roundCents((taxableBaseCents * taxRateBasisPoints) / BASIS_POINTS_DIVISOR);
  const totalCents = discountedSubtotalCents + taxCents;

  const profitCents = discountedSubtotalCents - knownCostCents;
  // Margin is profit as a share of price. With no positive price there is no
  // meaningful percentage, so report null ("n/a") instead of a misleading 0% —
  // the price can be zero while profitCents is a real loss. profitDollars below
  // still carries the loss; only the ratio is withheld.
  //
  // Use Math.round here, NOT roundCents: basis points are a signed ratio, not a
  // money amount, and a negative margin (a line priced below cost) is legitimate.
  // roundCents deliberately throws on negatives, so it must not be used for this.
  const marginBasisPoints =
    discountedSubtotalCents > 0
      ? Math.round((profitCents / discountedSubtotalCents) * BASIS_POINTS_DIVISOR)
      : null;

  return {
    lines: lineTotals,
    subtotalDollars: centsToDollars(subtotalCents),
    discountDollars: centsToDollars(appliedDiscountCents),
    discountedSubtotalDollars: centsToDollars(discountedSubtotalCents),
    taxableBaseDollars: centsToDollars(taxableBaseCents),
    taxDollars: centsToDollars(taxCents),
    totalDollars: centsToDollars(totalCents),
    margin: {
      totalCostDollars: centsToDollars(knownCostCents),
      totalPriceDollars: centsToDollars(discountedSubtotalCents),
      profitDollars: centsToDollars(profitCents),
      marginBasisPoints,
      costComplete
    }
  };
}
