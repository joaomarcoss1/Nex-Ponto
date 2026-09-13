-- NexPonto v5.1 — snapshots históricos e turnos atravessando competências.

alter table public.work_sessions
  add column if not exists schedule_snapshot_checksum text,
  add column if not exists contract_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists contract_snapshot_checksum text,
  add column if not exists snapshot_version integer not null default 1,
  add column if not exists immutable_at timestamptz;

update public.work_sessions
set schedule_snapshot_checksum = encode(digest(coalesce(schedule_snapshot,'{}'::jsonb)::text,'sha256'),'hex')
where schedule_snapshot_checksum is null;

create index if not exists idx_time_entries_tenant_work_session_occurred_v51
  on public.time_entries(tenant_id,work_session_id,server_timestamp,created_at);

create or replace view public.work_session_entry_facts_v51
with (security_invoker=true)
as
select
  ws.tenant_id,
  ws.id as work_session_id,
  ws.employee_id,
  ws.branch_id,
  ws.work_date,
  ws.timezone,
  ws.status as work_session_status,
  ws.schedule_snapshot,
  ws.schedule_snapshot_checksum,
  ws.contract_snapshot,
  ws.contract_snapshot_checksum,
  ws.snapshot_version,
  te.id as time_entry_id,
  te.action,
  te.status as time_entry_status,
  coalesce(te.server_timestamp,te.created_at) as occurred_at,
  te.event_sequence,
  te.entry_date,
  te.late_minutes,
  te.early_leave_minutes
from public.work_sessions ws
left join public.time_entries te
  on te.tenant_id=ws.tenant_id and te.work_session_id=ws.id;

create or replace function public.lock_work_session_snapshot_v51(p_tenant_id uuid,p_work_session_id uuid)
returns public.work_sessions
language plpgsql security definer set search_path=public
as $$
declare row_value public.work_sessions%rowtype;
begin
  select * into row_value from public.work_sessions where id=p_work_session_id and tenant_id=p_tenant_id for update;
  if not found then raise exception 'WORK_SESSION_NOT_FOUND'; end if;
  update public.work_sessions
     set schedule_snapshot_checksum=encode(digest(coalesce(schedule_snapshot,'{}'::jsonb)::text,'sha256'),'hex'),
         contract_snapshot_checksum=encode(digest(coalesce(contract_snapshot,'{}'::jsonb)::text,'sha256'),'hex'),
         immutable_at=coalesce(immutable_at,now()),updated_at=now()
   where id=row_value.id returning * into row_value;
  return row_value;
end $$;
revoke all on function public.lock_work_session_snapshot_v51(uuid,uuid) from public,anon,authenticated;
grant execute on function public.lock_work_session_snapshot_v51(uuid,uuid) to service_role;

create or replace function public.prevent_locked_session_snapshot_mutation_v51()
returns trigger language plpgsql set search_path=public as $$
begin
  if old.immutable_at is not null and (
    new.schedule_snapshot is distinct from old.schedule_snapshot or
    new.contract_snapshot is distinct from old.contract_snapshot or
    new.work_date is distinct from old.work_date or
    new.timezone is distinct from old.timezone
  ) then raise exception 'WORK_SESSION_SNAPSHOT_IMMUTABLE'; end if;
  return new;
end $$;
drop trigger if exists trg_work_session_snapshot_immutable_v51 on public.work_sessions;
create trigger trg_work_session_snapshot_immutable_v51 before update on public.work_sessions
for each row execute function public.prevent_locked_session_snapshot_mutation_v51();
