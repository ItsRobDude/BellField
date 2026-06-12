DELETE FROM relay_token_events WHERE kind = 'reactivated';

ALTER TABLE relay_token_events
  DROP CONSTRAINT relay_token_events_kind_check;

ALTER TABLE relay_token_events
  ADD CONSTRAINT relay_token_events_kind_check
  CHECK (kind IN ('issued', 'revoked', 'bound', 'rebound', 'suspended'));
