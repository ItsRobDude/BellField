DROP INDEX IF EXISTS outbound_messages_delivery_poll_idx;
DROP INDEX IF EXISTS outbound_messages_due_retry_idx;

ALTER TABLE outbound_messages
  DROP CONSTRAINT outbound_messages_status_check;

-- Canceled is being removed from the allowed statuses; fold into failed.
UPDATE outbound_messages SET status = 'failed', provider_error = COALESCE(provider_error, 'canceled')
WHERE status = 'canceled';

ALTER TABLE outbound_messages
  ADD CONSTRAINT outbound_messages_status_check
  CHECK (status IN ('queued', 'sent', 'failed', 'delivered', 'bounced', 'complained'));

ALTER TABLE outbound_messages
  DROP COLUMN status_checked_at,
  DROP COLUMN reply_to_email,
  DROP COLUMN from_name,
  DROP COLUMN expires_at,
  DROP COLUMN next_attempt_at,
  DROP COLUMN attempt_count;
