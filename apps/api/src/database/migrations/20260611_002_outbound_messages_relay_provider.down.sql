ALTER TABLE outbound_messages
  DROP CONSTRAINT outbound_messages_provider_check;

ALTER TABLE outbound_messages
  ADD CONSTRAINT outbound_messages_provider_check
  CHECK (provider IN ('resend'));
