CREATE TABLE identity_login_attempts (
  bucket_key text PRIMARY KEY,
  failed_count integer NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  window_started_at timestamptz NOT NULL,
  last_failed_at timestamptz NOT NULL,
  blocked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX identity_login_attempts_updated_at_idx
  ON identity_login_attempts (updated_at);
