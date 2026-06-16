-- Migration: 20260615_002_online_refund_requests_job_idx
-- The office job-payments read lists a job's pending/failed online refund requests
-- (one current row per payment). That query filters by job_id and walks
-- (payment_id, created_at desc); the PR1 table only indexed payment_id, so add the
-- composite that covers the job-level read.

create index if not exists online_refund_requests_job_idx
  on online_refund_requests(job_id, payment_id, created_at desc);
