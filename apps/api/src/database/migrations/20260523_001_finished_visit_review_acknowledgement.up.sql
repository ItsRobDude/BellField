alter table appointments
  add column if not exists finished_reviewed_at timestamptz,
  add column if not exists finished_reviewed_by text,
  add column if not exists finished_review_decision text;
