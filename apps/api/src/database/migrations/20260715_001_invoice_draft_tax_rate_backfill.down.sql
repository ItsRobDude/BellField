-- This is an intentionally non-destructive rollback for a data-only repair.
-- Once a draft has been backfilled, there is no reliable provenance separating
-- migration-written values from legitimate edits made afterward. Resetting tax
-- rates or totals would therefore risk corrupting current invoice drafts.
--
-- Rolling back records the migration as unapplied without rewriting invoice data.
select 1;
