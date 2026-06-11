CREATE TABLE relay_messages (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES relay_shops(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'delivered', 'bounced', 'complained', 'failed')),
  failure_code TEXT,
  provider_message_id TEXT,
  accepted_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT relay_messages_failure_shape CHECK (
    (status = 'failed' AND failure_code IS NOT NULL)
    OR (status <> 'failed' AND failure_code IS NULL)
  )
);

CREATE UNIQUE INDEX relay_messages_idempotency_idx
  ON relay_messages (shop_id, idempotency_key);

CREATE UNIQUE INDEX relay_messages_provider_message_idx
  ON relay_messages (provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE INDEX relay_messages_shop_accepted_idx
  ON relay_messages (shop_id, accepted_at DESC);

CREATE TABLE relay_suppressions (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES relay_shops(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('bounce', 'complaint', 'manual')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX relay_suppressions_shop_email_idx
  ON relay_suppressions (shop_id, lower(email));
