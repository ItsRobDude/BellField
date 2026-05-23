drop index if exists media_attachments_active_job_sha256_idx;

create unique index if not exists media_attachments_job_sha256_idx
  on media_attachments(job_id, sha256);
