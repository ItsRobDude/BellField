ALTER TABLE outbound_messages
  ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN next_attempt_at TIMESTAMPTZ,
  ADD COLUMN expires_at TIMESTAMPTZ,
  ADD COLUMN from_name TEXT,
  ADD COLUMN reply_to_email TEXT,
  ADD COLUMN status_checked_at TIMESTAMPTZ;

-- Existing terminal rows already had their one synchronous attempt.
UPDATE outbound_messages SET attempt_count = 1 WHERE status <> 'queued';

ALTER TABLE outbound_messages
  DROP CONSTRAINT outbound_messages_status_check;

ALTER TABLE outbound_messages
  ADD CONSTRAINT outbound_messages_status_check
  CHECK (status IN ('queued', 'sent', 'failed', 'canceled', 'delivered', 'bounced', 'complained'));

CREATE INDEX outbound_messages_due_retry_idx
  ON outbound_messages (next_attempt_at)
  WHERE status = 'queued';

CREATE INDEX outbound_messages_delivery_poll_idx
  ON outbound_messages (sent_at DESC)
  WHERE status = 'sent' AND provider_message_id IS NOT NULL;
