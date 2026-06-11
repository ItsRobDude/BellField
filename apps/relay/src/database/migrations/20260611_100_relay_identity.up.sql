CREATE TABLE relay_shops (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0),
  license_id TEXT NOT NULL CHECK (length(trim(license_id)) > 0),
  status TEXT NOT NULL CHECK (status IN ('active', 'suspended')),
  monthly_send_quota INTEGER NOT NULL CHECK (monthly_send_quota > 0),
  suspended_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT relay_shops_suspension_shape CHECK (
    (status = 'active' AND suspended_reason IS NULL)
    OR status = 'suspended'
  )
);

CREATE UNIQUE INDEX relay_shops_license_idx ON relay_shops (license_id);

CREATE TABLE relay_tokens (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES relay_shops(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
  bound_instance_id TEXT,
  bound_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  CONSTRAINT relay_tokens_revocation_shape CHECK (
    (status = 'active' AND revoked_at IS NULL)
    OR (status = 'revoked' AND revoked_at IS NOT NULL)
  ),
  CONSTRAINT relay_tokens_binding_shape CHECK (
    (bound_instance_id IS NULL AND bound_at IS NULL)
    OR (bound_instance_id IS NOT NULL AND bound_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX relay_tokens_one_active_per_shop_idx
  ON relay_tokens (shop_id)
  WHERE status = 'active';

CREATE TABLE relay_token_events (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES relay_shops(id) ON DELETE CASCADE,
  token_id TEXT NOT NULL REFERENCES relay_tokens(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('issued', 'revoked', 'bound', 'rebound', 'suspended')),
  instance_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX relay_token_events_token_created_idx
  ON relay_token_events (token_id, created_at DESC);

CREATE INDEX relay_token_events_rebind_window_idx
  ON relay_token_events (token_id, created_at DESC)
  WHERE kind = 'rebound';
