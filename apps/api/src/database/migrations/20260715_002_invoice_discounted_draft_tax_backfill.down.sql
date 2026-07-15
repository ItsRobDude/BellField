-- This is an intentionally non-destructive rollback for a data-only repair.
-- The migration cannot distinguish values it backfilled from legitimate edits
-- made later, so resetting tax rates or totals would risk corrupting drafts.
--
-- Rolling back records the migration as unapplied without rewriting invoice data.
select 1;
