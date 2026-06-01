// BellField stores and transmits money as decimal dollars (numeric(12,2) in the
// database, plain `number` on the wire). Doing estimate math directly on those
// floating-point dollars would accumulate rounding drift, which is unacceptable
// for anything that feeds an invoice. So the pricing engine converts to integer
// cents at the edge, does every calculation in whole cents, and converts back to
// dollars only when returning results. These helpers are the single place that
// conversion and rounding happen, so the rules stay consistent and auditable.

// Sub-cent precision kept before the final half-up step. Binary floating point
// can't hold a value like 100.5 exactly: `1.005 * 100` is actually
// 100.49999999999999, which naive Math.round would drag DOWN to 100 instead of
// up to 101. Snapping to 4 decimal places of a cent (i.e. 1/10000 of a cent)
// absorbs that representation noise — far finer than any real money input — so a
// value the caller means as a clean fraction of a cent rounds the way they expect.
const SUBCENT_PRECISION = 4;

/**
 * Round a possibly-fractional cents value to a whole cent using half-up rounding.
 * The engine only ever deals with non-negative money, so half-up (ties toward
 * +infinity, which is what `Math.round` does for non-negative input) matches
 * normal billing expectations: $0.005 rounds up to $0.01.
 *
 * Before rounding we strip floating-point noise (see SUBCENT_PRECISION) so the
 * half-up promise actually holds for values that arrive perturbed from a float
 * multiply, e.g. `1.005 * 100`. Without this, ties that should round up silently
 * round down on a subset of inputs, which is exactly the kind of quiet money error
 * an estimate feeding an invoice must not have.
 */
export function roundCents(value: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError('Cannot round a non-finite money value.');
  }
  if (value < 0) {
    throw new RangeError('Estimate money values must not be negative.');
  }
  const denoised = Number(value.toFixed(SUBCENT_PRECISION));
  return Math.round(denoised);
}

/** Convert decimal dollars to whole cents, absorbing floating-point input noise. */
export function dollarsToCents(dollars: number): number {
  if (!Number.isFinite(dollars)) {
    throw new RangeError('Cannot convert a non-finite dollar value to cents.');
  }
  if (dollars < 0) {
    throw new RangeError('Estimate money values must not be negative.');
  }
  return roundCents(dollars * 100);
}

/** Convert whole cents back to decimal dollars for the wire/database boundary. */
export function centsToDollars(cents: number): number {
  return cents / 100;
}
