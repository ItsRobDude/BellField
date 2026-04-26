update appointments
set status = case
  when status = 'scheduled' then 'assigned'
  when status = 'dispatched' then 'confirmed'
  else status
end;

update jobs
set status = case
  when status in ('new', 'scheduled', 'inProgress', 'waitingOnParts', 'completed') then 'open'
  else status
end;

alter table appointments
  drop column if exists finish_outcome,
  drop column if exists visit_notes,
  drop column if exists has_charge_activity,
  drop column if exists register_follow_up_note;
