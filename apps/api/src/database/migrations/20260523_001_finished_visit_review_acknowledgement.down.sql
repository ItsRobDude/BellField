alter table appointments
  drop column if exists finished_review_decision,
  drop column if exists finished_reviewed_by,
  drop column if exists finished_reviewed_at;
