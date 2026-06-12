drop index outbound_messages_acceptance_link_idx;

alter table outbound_messages
  drop column acceptance_payload,
  drop column acceptance_link_id,
  drop column acceptance_url,
  drop column acceptance_link_expires_at,
  drop column acceptance_decision_applied_at;
