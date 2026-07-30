-- NexPonto v5.1 — snapshot histórico completo e consulta de marcações por sessão.

create or replace function public.normalize_work_session_snapshot_v51()
returns trigger
language plpgsql
set search_path=public
as $$
declare normalized jsonb;
begin
  normalized := coalesce(new.schedule_snapshot,'{}'::jsonb);
  normalized := normalized || jsonb_build_object(
    'source',coalesce(nullif(normalized->>'source',''),'clock_registration'),
    'timezone',coalesce(nullif(normalized->>'timezone',''),new.timezone),
    'expectedDailyMinutes',coalesce(
      nullif(normalized->>'expectedDailyMinutes','')::integer,
      nullif(normalized->>'expected_daily_minutes','')::integer,
      0
    ),
    'expectedStartTime',coalesce(normalized->>'expectedStartTime',normalized->>'expected_start_time'),
    'expectedEndTime',coalesce(normalized->>'expectedEndTime',normalized->>'expected_end_time'),
    'expectedLunchMinutes',coalesce(
      nullif(normalized->>'expectedLunchMinutes','')::integer,
      nullif(normalized->>'expected_lunch_minutes','')::integer,
      0
    ),
    'snapshotVersion',coalesce(nullif(normalized->>'snapshotVersion','')::integer,1)
  );
  new.schedule_snapshot := normalized;
  new.schedule_snapshot_checksum := encode(digest(normalized::text,'sha256'),'hex');
  return new;
exception when invalid_text_representation then
  raise exception 'INVALID_WORK_SESSION_SNAPSHOT';
end $$;

with normalized as (
  select ws.id,coalesce(ws.schedule_snapshot,'{}'::jsonb) || jsonb_build_object(
      'source',coalesce(nullif(ws.schedule_snapshot->>'source',''),'clock_registration'),
      'timezone',coalesce(nullif(ws.schedule_snapshot->>'timezone',''),ws.timezone),
      'expectedDailyMinutes',coalesce(
        case when coalesce(ws.schedule_snapshot->>'expectedDailyMinutes','') ~ '^\d+$' then (ws.schedule_snapshot->>'expectedDailyMinutes')::integer end,
        case when coalesce(ws.schedule_snapshot->>'expected_daily_minutes','') ~ '^\d+$' then (ws.schedule_snapshot->>'expected_daily_minutes')::integer end,
        0
      ),
      'expectedStartTime',coalesce(ws.schedule_snapshot->>'expectedStartTime',ws.schedule_snapshot->>'expected_start_time'),
      'expectedEndTime',coalesce(ws.schedule_snapshot->>'expectedEndTime',ws.schedule_snapshot->>'expected_end_time'),
      'expectedLunchMinutes',coalesce(
        case when coalesce(ws.schedule_snapshot->>'expectedLunchMinutes','') ~ '^\d+$' then (ws.schedule_snapshot->>'expectedLunchMinutes')::integer end,
        case when coalesce(ws.schedule_snapshot->>'expected_lunch_minutes','') ~ '^\d+$' then (ws.schedule_snapshot->>'expected_lunch_minutes')::integer end,
        0
      ),
      'snapshotVersion',coalesce(
        case when coalesce(ws.schedule_snapshot->>'snapshotVersion','') ~ '^\d+$' then (ws.schedule_snapshot->>'snapshotVersion')::integer end,
        1
      )
    ) as snapshot
  from public.work_sessions ws
  where ws.immutable_at is null
    and (ws.schedule_snapshot_checksum is null
     or not (ws.schedule_snapshot ? 'source')
     or not (ws.schedule_snapshot ? 'timezone')
     or not (ws.schedule_snapshot ? 'expectedDailyMinutes'))
)
update public.work_sessions ws
set schedule_snapshot=n.snapshot,
    schedule_snapshot_checksum=encode(digest(n.snapshot::text,'sha256'),'hex')
from normalized n
where ws.id=n.id;

drop trigger if exists trg_work_session_snapshot_normalize_v51 on public.work_sessions;
create trigger trg_work_session_snapshot_normalize_v51
before insert or update of schedule_snapshot,timezone on public.work_sessions
for each row execute function public.normalize_work_session_snapshot_v51();

create index if not exists idx_time_entries_session_occurred_v51
  on public.time_entries(tenant_id,work_session_id,entry_timestamp,event_sequence)
  where work_session_id is not null;

comment on function public.normalize_work_session_snapshot_v51() is
  'Mantém o snapshot histórico da jornada autocontido e com checksum, sem reinterpretar competências pelo cadastro atual.';
