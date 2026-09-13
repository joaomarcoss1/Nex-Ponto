-- NexPonto v4.0 — ponto transacional, sessões de jornada e QR auditável.

-- Idempotência deve ser única por tenant, não global.
drop index if exists public.idx_time_entries_idempotency_key;
create unique index if not exists uq_time_entries_tenant_idempotency
  on public.time_entries(tenant_id,idempotency_key) where idempotency_key is not null;

create table if not exists public.qr_token_uses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  qr_token_id uuid not null references public.branch_qr_tokens(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  time_entry_id uuid references public.time_entries(id) on delete set null,
  idempotency_key text not null,
  used_at timestamptz not null default now(),
  device_hash text,
  unique(tenant_id,qr_token_id,employee_id,idempotency_key)
);
create index if not exists idx_qr_token_uses_replay
  on public.qr_token_uses(tenant_id,qr_token_id,employee_id,used_at desc);

alter table public.qr_token_uses enable row level security;
create policy tenant_read on public.qr_token_uses for select to authenticated
  using(tenant_id=public.current_tenant_id() and public.is_tenant_admin_member(tenant_id));
create policy tenant_write on public.qr_token_uses for all to authenticated
  using(tenant_id=public.current_tenant_id() and public.is_tenant_admin_member(tenant_id))
  with check(tenant_id=public.current_tenant_id() and public.is_tenant_admin_member(tenant_id));

create or replace function public.register_time_entry_v4(
  p_tenant_id uuid,
  p_employee_id uuid,
  p_branch_id uuid,
  p_action public.time_action,
  p_entry_timestamp timestamptz,
  p_entry_date date,
  p_timezone text,
  p_latitude numeric,
  p_longitude numeric,
  p_distance_meters integer,
  p_inside_allowed_radius boolean,
  p_device_info text,
  p_idempotency_key text,
  p_qr_token_id uuid,
  p_gps_accuracy_meters integer,
  p_validation_radius_meters integer,
  p_expected_start_time time,
  p_expected_end_time time,
  p_expected_daily_minutes integer,
  p_expected_lunch_minutes integer,
  p_expected_lunch_start_time time,
  p_expected_lunch_end_time time,
  p_late_minutes integer,
  p_early_leave_minutes integer,
  p_lunch_variation_minutes integer,
  p_schedule_compliance_status text,
  p_required_justification boolean,
  p_justification_text text,
  p_status public.time_entry_status,
  p_occurrence_review_status text,
  p_review_flags text[],
  p_gps_snapshot jsonb,
  p_attempt_id uuid default null,
  p_client_timestamp timestamptz default null,
  p_offline_status text default 'online'
)
returns public.time_entries
language plpgsql
security definer
set search_path=public
as $$
declare
  employee_row public.employees%rowtype;
  branch_row public.branches%rowtype;
  session_row public.work_sessions%rowtype;
  entry_row public.time_entries%rowtype;
  event_type_value text;
  next_sequence integer;
begin
  if p_tenant_id is null then raise exception 'TENANT_REQUIRED'; end if;
  if p_idempotency_key is null or length(p_idempotency_key)<12 then raise exception 'IDEMPOTENCY_REQUIRED'; end if;

  select * into entry_row from public.time_entries
  where tenant_id=p_tenant_id and idempotency_key=p_idempotency_key;
  if found then return entry_row; end if;

  select * into employee_row from public.employees
  where id=p_employee_id and tenant_id=p_tenant_id and active for update;
  if not found then raise exception 'EMPLOYEE_NOT_FOUND'; end if;
  select * into branch_row from public.branches
  where id=p_branch_id and tenant_id=p_tenant_id and active;
  if not found then raise exception 'BRANCH_NOT_FOUND'; end if;

  if exists(
    select 1 from public.payroll_periods pp
    where pp.tenant_id=p_tenant_id
      and (pp.branch_id is null or pp.branch_id=p_branch_id)
      and p_entry_date between pp.start_date and pp.end_date
      and pp.status::text in ('closed','closed_with_exceptions','paid')
  ) then
    raise exception 'CLOSED_PERIOD';
  end if;

  select * into session_row
  from public.work_sessions ws
  where ws.tenant_id=p_tenant_id and ws.employee_id=p_employee_id and ws.status='open'
  order by ws.started_at desc nulls last,ws.created_at desc
  limit 1 for update;

  if p_action='start_shift' then
    if found then raise exception 'OPEN_SESSION_EXISTS'; end if;
    insert into public.work_sessions(
      tenant_id,employee_id,branch_id,work_date,timezone,status,started_at,schedule_snapshot
    ) values(
      p_tenant_id,p_employee_id,p_branch_id,p_entry_date,p_timezone,'open',p_entry_timestamp,
      jsonb_build_object(
        'expected_start_time',p_expected_start_time,
        'expected_end_time',p_expected_end_time,
        'expected_daily_minutes',p_expected_daily_minutes,
        'expected_lunch_minutes',p_expected_lunch_minutes,
        'expected_lunch_start_time',p_expected_lunch_start_time,
        'expected_lunch_end_time',p_expected_lunch_end_time
      )
    ) returning * into session_row;
  elsif not found then
    raise exception 'OPEN_SESSION_NOT_FOUND';
  end if;

  if session_row.branch_id<>p_branch_id then raise exception 'SESSION_BRANCH_MISMATCH'; end if;

  select coalesce(max(sequence),0)+1 into next_sequence
  from public.work_session_events where work_session_id=session_row.id;

  event_type_value := case p_action
    when 'start_shift' then 'clock_in'
    when 'start_lunch' then 'break_start'
    when 'end_lunch' then 'break_end'
    when 'end_shift' then 'clock_out'
  end;

  insert into public.time_entries(
    tenant_id,employee_id,branch_id,work_session_id,event_sequence,action,entry_timestamp,entry_date,
    client_timestamp,server_timestamp,offline_status,latitude,longitude,distance_meters,
    inside_allowed_radius,device_info,idempotency_key,qr_token_id,gps_accuracy_meters,
    validation_branch_id,validation_branch_latitude,validation_branch_longitude,validation_radius_meters,
    expected_start_time,expected_end_time,expected_daily_minutes,expected_lunch_minutes,
    expected_lunch_start_time,expected_lunch_end_time,late_minutes,early_leave_minutes,
    lunch_variation_minutes,schedule_compliance_status,required_justification,justification_text,
    status,occurrence_review_status,review_flags,gps_diagnostic_snapshot
  ) values(
    p_tenant_id,p_employee_id,p_branch_id,session_row.id,next_sequence,p_action,p_entry_timestamp,p_entry_date,
    p_client_timestamp,clock_timestamp(),p_offline_status,p_latitude,p_longitude,p_distance_meters,
    p_inside_allowed_radius,p_device_info,p_idempotency_key,p_qr_token_id,p_gps_accuracy_meters,
    p_branch_id,branch_row.latitude,branch_row.longitude,p_validation_radius_meters,
    p_expected_start_time,p_expected_end_time,p_expected_daily_minutes,p_expected_lunch_minutes,
    p_expected_lunch_start_time,p_expected_lunch_end_time,greatest(0,coalesce(p_late_minutes,0)),
    greatest(0,coalesce(p_early_leave_minutes,0)),coalesce(p_lunch_variation_minutes,0),
    coalesce(p_schedule_compliance_status,'not_evaluated'),p_required_justification,p_justification_text,
    p_status,p_occurrence_review_status,coalesce(p_review_flags,'{}'),coalesce(p_gps_snapshot,'{}')
  ) returning * into entry_row;

  insert into public.work_session_events(
    tenant_id,work_session_id,time_entry_id,event_type,break_type,sequence,occurred_at,metadata
  ) values(
    p_tenant_id,session_row.id,entry_row.id,event_type_value,
    case when event_type_value in ('break_start','break_end') then 'meal_or_rest' else null end,
    next_sequence,p_entry_timestamp,jsonb_build_object('action',p_action,'offline_status',p_offline_status)
  );

  if p_action='end_shift' then
    update public.work_sessions
       set status=case when p_status='blocked' then 'pending_review' else 'completed' end,
           ended_at=p_entry_timestamp,updated_at=now()
     where id=session_row.id;
  end if;

  if p_qr_token_id is not null then
    update public.branch_qr_tokens
       set last_used_at=now(),use_count=use_count+1
     where id=p_qr_token_id and tenant_id=p_tenant_id;
    insert into public.qr_token_uses(tenant_id,qr_token_id,employee_id,time_entry_id,idempotency_key,device_hash)
    values(p_tenant_id,p_qr_token_id,p_employee_id,entry_row.id,p_idempotency_key,
      encode(digest(coalesce(p_device_info,''),'sha256'),'hex'));
  end if;

  if p_attempt_id is not null then
    update public.clock_attempts set resolved_time_entry_id=entry_row.id
    where id=p_attempt_id and tenant_id=p_tenant_id;
  end if;

  insert into public.audit_logs(
    tenant_id,user_email,action,entity,entity_id,new_data
  ) values(
    p_tenant_id,'employee_portal','clock_register','time_entries',entry_row.id::text,
    jsonb_build_object('employee_id',p_employee_id,'branch_id',p_branch_id,'action',p_action,'status',p_status,'work_session_id',session_row.id)
  );

  return entry_row;
end $$;

revoke all on function public.register_time_entry_v4(
  uuid,uuid,uuid,public.time_action,timestamptz,date,text,numeric,numeric,integer,boolean,text,text,uuid,integer,integer,
  time,time,integer,integer,time,time,integer,integer,integer,text,boolean,text,public.time_entry_status,text,text[],jsonb,uuid,timestamptz,text
) from public,anon,authenticated;
grant execute on function public.register_time_entry_v4(
  uuid,uuid,uuid,public.time_action,timestamptz,date,text,numeric,numeric,integer,boolean,text,text,uuid,integer,integer,
  time,time,integer,integer,time,time,integer,integer,integer,text,boolean,text,public.time_entry_status,text,text[],jsonb,uuid,timestamptz,text
) to service_role;
