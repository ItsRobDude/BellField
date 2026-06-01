-- Migration: 20260601_001_estimates (rollback)
-- Drop line items first (FK -> estimates), then estimates.
drop table if exists estimate_line_items;
drop table if exists estimates;
