import type { CostingPolicy, CostingStatus, RegisterEntryKind } from './company-data.types';

export type RegisterCostingClassification = {
  costingStatus: CostingStatus;
  costingPolicy: CostingPolicy | null;
};

// Register kinds that owe a cost figure. In Slice 1a there is no structured cost data from
// the field yet (the truck-picker is Slice 1b), so a cost-expected line cannot be costed
// automatically — it lands in `needsResolution` for the office to resolve. Everything else
// (serviceItem / membership / other) is billing-only in v1 and owes no cost.
const COST_EXPECTED_KINDS: ReadonlySet<RegisterEntryKind> = new Set<RegisterEntryKind>([
  'part',
  'labor'
]);

/**
 * Classify a register line's cost side from its kind. The concrete policy
 * (trackedInventory / laborActual / ...) is decided when the office RESOLVES the line, so an
 * unresolved cost-expected line carries no policy yet (null). A non-cost line is `notCosted`
 * with the `none` policy. See docs/job-costing-from-field-capture-spec.md §3–§5.
 *
 * The server never asks the technician to pick a policy; this is pure inference from `kind`.
 */
export function classifyRegisterCosting(kind: RegisterEntryKind): RegisterCostingClassification {
  if (COST_EXPECTED_KINDS.has(kind)) {
    return { costingStatus: 'needsResolution', costingPolicy: null };
  }
  return { costingStatus: 'notCosted', costingPolicy: 'none' };
}
