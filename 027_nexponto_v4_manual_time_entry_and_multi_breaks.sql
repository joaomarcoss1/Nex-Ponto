-- NexPonto v4 — marcação manual transacional e suporte real a múltiplos intervalos.

-- O índice legado impedia mais de uma pausa do mesmo tipo na mesma jornada.
drop index if exists public.idx_unique_time_entry_action_per_day;

create index if not exists idx_time_entries_employee_date_action
  on public.time_entries(tenant_id, employee_id, entry_date, action, entry_timestamp)
  where status in ('valid','pending_review','adjusted');

create or replace function public.create_manual_time_entry_v4(
  p_tenant_id uuid,
  p_membership_id uuid,
  p_user_id uuid,
  p_user_email text,
  p_employee_id uuid,
  p_branch_id uuid,
  p_action public.time_action,
  p_entry_timestamp timestamptz,
  p_entry_date date,
  p_reason text,
  p_idempotency_key text,
  p_late_minutes integer default 0,
  p_early_leave_minutes integer default 0,
  p_justification_text text default null,
  p_request_id text default null
)
returns public.time_entries
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  employee_row public.employees%rowtype;
  branch_row public.branches%rowtype;
  session_row public.work_sessions%rowtype;
  entry_row public.time_entries%rowtype;
  next_sequence integer;
  mapped_event text;
begin
  if p_tenant_id is null or p_employee_id is null or p_branch_id is null then
    raise exception 'TENANT_EMPLOYEE_BRANCH_REQUIRED';
  end if;
  if length(trim(coalesce(p_reason,''))) < 5 then
    raise exception 'MANUAL_REASON_REQUIRED';
  end if;
  if p_entry_timestamp is null or p_entry_date is null then
    raise exception 'MANUAL_TIMESTAMP_REQUIRED';
  end if;
  if p_idempotency_key is null or length(p_idempotency_key) < 12 then
    raise exception 'IDEMPOTENCY_REQUIRED';
  end if;

  select * into entry_row
  from public.time_entries
  where tenant_id = p_tenant_id and idempotency_key = p_idempotency_key
  limit 1;
  if found then
    return entry_row;
  end if;

  select * into employee_row
  from public.employees
  where id = p_employee_id and tenant_id = p_tenant_id and active = true
  for share;
  if not found then raise exception 'EMPLOYEE_NOT_FOUND'; end if;

  select * into branch_row
  from public.branches
  where id = p_branch_id and tenant_id = p_tenant_id and active = true
  for share;
  if not found then raise exception 'BRANCH_NOT_FOUND'; end if;

  if exists (
    select 1
    from public.payroll_periods pp
    where pp.tenant_id = p_tenant_id
      and (pp.branch_id is null or pp.branch_id = p_branch_id)
      and p_entry_date between pp.start_date and pp.end_date
      and pp.status::text in ('closed','closed_with_exceptions','paid')
  ) then
    raise exception 'PAYROLL_PERIOD_CLOSED';
  end if;

  select * into session_row
  from public.work_sessions ws
  where ws.tenant_id = p_tenant_id
    and ws.employee_id = p_employee_id
    and ws.branch_id = p_branch_id
    and ws.work_date = p_entry_date
    and ws.status <> 'cancelled'
  order by ws.created_at desc
  limit 1
  for update;

  if not found then
    insert into public.work_sessions(
      tenant_id, employee_id, branch_id, work_date, timezone, status,
      started_at, ended_at, schedule_snapshot
    ) values (
      p_tenant_id, p_employee_id, p_branch_id, p_entry_date,
      coalesce(nullif(branch_row.timezone,''),'America/Fortaleza'),
      case when p_action = 'end_shift' then 'completed' else 'pending_review' end,
      case when p_action = 'start_shift' then p_entry_timestamp else null end,
      case when p_action = 'end_shift' then p_entry_timestamp else null end,
      jsonb_build_object('source','manual_entry','reason',trim(p_reason))
    ) returning * into session_row;
  end if;

  select coalesce(max(wse.sequence),0) + 1 into next_sequence
  from public.work_session_events wse
  where wse.work_session_id = session_row.id;

  mapped_event := case p_action
    when 'start_shift' then 'clock_in'
    when 'start_lunch' then 'break_start'
    when 'end_lunch' then 'break_end'
    when 'end_shift' then 'clock_out'
  end;

  insert into public.time_entries(
    tenant_id, employee_id, branch_id, work_session_id, event_sequence,
    action, entry_timestamp, entry_date, inside_allowed_radius,
    late_minutes, early_leave_minutes, required_justification,
    justification_text, device_info, status, occurrence_review_status,
    review_flags, adjusted_by, adjusted_at, adjustment_reason,
    idempotency_key, server_timestamp, offline_status
  ) values (
    p_tenant_id, p_employee_id, p_branch_id, session_row.id, next_sequence,
    p_action, p_entry_timestamp, p_entry_date, true,
    greatest(0,coalesce(p_late_minutes,0)), greatest(0,coalesce(p_early_leave_minutes,0)), false,
    nullif(trim(coalesce(p_justification_text,'')),''), 'marcacao administrativa',
    'adjusted', 'adjusted', array['ponto_adicionado_manual'],
    p_user_id, now(), trim(p_reason), p_idempotency_key, now(), 'online'
  ) returning * into entry_row;

  insert into public.work_session_events(
    tenant_id, work_session_id, time_entry_id, event_type, break_type,
    sequence, occurred_at, metadata
  ) values (
    p_tenant_id, session_row.id, entry_row.id, mapped_event,
    case when mapped_event in ('break_start','break_end') then 'manual' else null end,
    next_sequence, p_entry_timestamp,
    jsonb_build_object('manual',true,'reason',trim(p_reason),'membership_id',p_membership_id)
  );

  update public.work_sessions
  set started_at = case
        when p_action = 'start_shift' then coalesce(started_at,p_entry_timestamp)
        else started_at
      end,
      ended_at = case when p_action = 'end_shift' then p_entry_timestamp else ended_at end,
      status = case when p_action = 'end_shift' then 'completed' else status end,
      updated_at = now()
  where id = session_row.id;

  insert into public.audit_logs(
    tenant_id, membership_id, user_id, user_email, branch_id,
    action, entity, entity_id, reason, new_data, request_id
  ) values (
    p_tenant_id, p_membership_id, p_user_id, coalesce(p_user_email,'sistema'), p_branch_id,
    'manual_create', 'time_entries', entry_row.id::text, trim(p_reason),
    jsonb_build_object(
      'employee_id',p_employee_id,
      'branch_id',p_branch_id,
      'action',p_action,
      'entry_timestamp',p_entry_timestamp,
      'work_session_id',session_row.id
    ),
    p_request_id
  );

  return entry_row;
end;
$$;

revoke all on function public.create_manual_time_entry_v4(
  uuid,uuid,uuid,text,uuid,uuid,public.time_action,timestamptz,date,text,text,integer,integer,text,text
) from public, anon, authenticated;
grant execute on function public.create_manual_time_entry_v4(
  uuid,uuid,uuid,text,uuid,uuid,public.time_action,timestamptz,date,text,text,integer,integer,text,text
) to service_role;
