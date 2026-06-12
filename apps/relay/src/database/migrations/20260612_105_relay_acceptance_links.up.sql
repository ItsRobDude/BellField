CREATE TABLE relay_acceptance_links (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES relay_shops(id) ON DELETE CASCADE,
  relay_message_id TEXT NOT NULL REFERENCES relay_messages(id) ON DELETE CASCADE,
  -- SHA-256 hex of the full link token; the plaintext exists only in the sent
  -- email and the minting response (docs/acceptance-links-design.md).
  token_hash TEXT NOT NULL,
  estimate_ref TEXT NOT NULL,
  estimate_version INTEGER NOT NULL,
  title TEXT NOT NULL,
  options JSONB NOT NULL,
  -- 'expired' is computed from expires_at at read time, never stored, so no
  -- sweeper job is needed.
  status TEXT NOT NULL CHECK (status IN ('open', 'approved', 'declined', 'superseded')),
  decided_option_id TEXT,
  decline_reasons TEXT[] NOT NULL DEFAULT '{}',
  homeowner_note TEXT,
  decided_at TIMESTAMPTZ,
  decided_by_ip TEXT,
  -- Set when the install acks the decision; decided + unacked rows are the
  -- at-least-once poll backlog. Rows are retained after ack.
  delivered_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT relay_acceptance_links_decision_shape CHECK (
    (status IN ('approved', 'declined') AND decided_at IS NOT NULL)
    OR (status IN ('open', 'superseded') AND decided_at IS NULL)
  )
);

CREATE UNIQUE INDEX relay_acceptance_links_token_hash_idx
  ON relay_acceptance_links (token_hash);

CREATE INDEX relay_acceptance_links_shop_estimate_idx
  ON relay_acceptance_links (shop_id, estimate_ref);

CREATE INDEX relay_acceptance_links_undelivered_idx
  ON relay_acceptance_links (shop_id)
  WHERE decided_at IS NOT NULL AND delivered_at IS NULL;
