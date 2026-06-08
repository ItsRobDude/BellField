// Public contract surface for @bellfield/contracts. Declarations live in private domain
// files (split per docs/maintainability-refactor-plan.md, Slice 4); this barrel re-exports
// them so clients keep importing everything from "@bellfield/contracts". No subpath exports.
export * from './platform-health.js';
export * from './identity-access.js';
export * from './crm.js';
export * from './equipment.js';
export * from './jobs.js';
export * from './dispatch.js';
export * from './media.js';
export * from './estimates.js';
export * from './invoices-payments.js';
export * from './inventory.js';
export * from './catalog.js';
export * from './purchasing.js';
export * from './job-costing.js';
export * from './bookkeeping.js';
export * from './system-diagnostics.js';
export * from './history.js';
export * from './reporting.js';
