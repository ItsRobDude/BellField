alter table appointments
  add column if not exists finish_outcome text,
  add column if not exists visit_notes text,
  add column if not exists has_charge_activity boolean,
  add column if not exists register_follow_up_note text;

update appointments
set status = 'scheduled'
where status = 'assigned';

update jobs
set status = 'closed'
where status = 'posted';

update jobs
set status = case
  when exists (
    select 1
    from appointments
    where appointments.job_id = jobs.id
      and appointments.status in ('onTheWay', 'arrived', 'working', 'noAnswer', 'finished')
  ) then 'inProgress'
  when exists (
    select 1
    from appointments
    where appointments.job_id = jobs.id
      and appointments.status <> 'cancelled'
  ) then 'scheduled'
  else 'new'
end
where status = 'open';
