-- Acceptance-link fields for estimate sends (docs/acceptance-links-design.md
-- 6a.2). The payload is frozen on the intent row at queue time (D8-style
-- pinning) so a worker retry hours later mints the link the office saw;
-- the link id/url/expiry land when the relay reports the send as sent, and
-- applied_at dedupes at-least-once decision delivery from the relay.
alter table outbound_messages
  add column acceptance_payload jsonb,
  add column acceptance_link_id text,
  add column acceptance_url text,
  add column acceptance_link_expires_at timestamptz,
  add column acceptance_decision_applied_at timestamptz;

create index outbound_messages_acceptance_link_idx
  on outbound_messages (acceptance_link_id)
  where acceptance_link_id is not null;
