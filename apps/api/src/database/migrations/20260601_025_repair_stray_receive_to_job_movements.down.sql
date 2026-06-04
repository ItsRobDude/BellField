-- Irreversible data repair: the deleted rows were bug-created phantom job-cost movements with no
-- legitimate history to restore. This down migration is a no-op.
select 1;
