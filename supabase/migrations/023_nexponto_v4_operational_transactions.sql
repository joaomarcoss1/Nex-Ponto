-- NexPonto v4.0 — transações operacionais, RLS por filial, QR sem segredo persistido,
-- vigências de funcionamento, validação presencial de GPS e ledger de banco de horas.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. QR: o segredo bruto nunca deve permanecer no banco.
-- ---------------------------------------------------------------------------
alter table public.branch_qr_tokens alter column token drop not null;
update public.branch_qr_tokens set token = null where token is not null;
alter table public.branch_qr_tokens
  add column if not exists issued_at timestamptz not null default now(),
  add column if not exists max_uses integer,
  add column if not exists rotated_from uuid references public.branch_qr_tokens(id) on delete set null;

alter table public.branch_qr_tokens drop constraint if exists branch_qr_tokens_validity_window;
alter table public.branch_qr_tokens add constraint branch_qr_tokens_validity_window
  check (valid_until > created_at and valid_until <= created_at + interval '7 days');
alter table public.branch_qr_tokens drop constraint if exists branch_qr_tokens_max_uses_valid;
alter table public.branch_qr_tokens add constraint branch_qr_tokens_max_uses_valid
  check (max_uses is null or max_uses > 0);

create or replace function public.expire_branch_qr_tokens(p_tenant_id uuid default null)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare affected integer;
begin
  update public.branch_qr_tokens
     set active=false, revoked_at=coalesce(revoked_at,now())
   where active
     and valid_until<=now()
     and (p_tenant_id is null or tenant_id=p_tenant_id);
  get diagnostics affected = row_count;
  return affected;
end $$;
revoke all on function public.expire_branch_qr_tokens(uuid) from public,anon,authenticated;
grant execute on function public.expire_branch_qr_tokens(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Funcionamento por filial com vigência única e atualização atômica.
-- ---------------------------------------------------------------------------
create or replace function public.replace_branch_operating_hours_v4(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_effective_from date,
  p_hours jsonb,
  p_actor_user_id uuid,
  p_membership_id uuid,
  p_reason text default 'Atualização do horário de funcionamento'
)
returns setof public.branch_operating_hours
language plpgsql
security definer
set search_path=public
as $$
declare
  item jsonb;
  weekday_value integer;
  closed_value boolean;
  opens_value time;
  closes_value time;
  inserted_row public.branch_operating_hours%rowtype;
begin
  if p_tenant_id is null or p_branch_id is null then raise exception 'TENANT_AND_BRANCH_REQUIRED'; end if;
  if p_effective_from is null then raise exception 'EFFECTIVE_FROM_REQUIRED'; end if;
  if jsonb_typeof(p_hours)<>'array' or jsonb_array_length(p_hours)<>7 then
    raise exception 'SEVEN_WEEKDAYS_REQUIRED';
  end if;
  if not exists(select 1 from public.branches where id=p_branch_id and tenant_id=p_tenant_id and active) then
    raise exception 'BRANCH_NOT_FOUND';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':'||p_branch_id::text,0));

  -- Não permite duas versões abertas. A versão anterior termina no dia anterior.
  update public.branch_operating_hours
     set effective_until=p_effective_from-1, updated_at=now()
   where tenant_id=p_tenant_id and branch_id=p_branch_id
     and effective_from<p_effective_from
     and (effective_until is null or effective_until>=p_effective_from);

  delete from public.branch_operating_hours
   where tenant_id=p_tenant_id and branch_id=p_branch_id and effective_from=p_effective_from;

  for item in select value from jsonb_array_elements(p_hours)
  loop
    weekday_value := (item->>'weekday')::integer;
    closed_value := coalesce((item->>'is_closed')::boolean,false);
    if weekday_value not between 0 and 6 then raise exception 'INVALID_WEEKDAY'; end if;
    opens_value := nullif(item->>'opens_at','')::time;
    closes_value := nullif(item->>'closes_at','')::time;
    if not closed_value and (opens_value is null or closes_value is null) then
      raise exception 'OPEN_AND_CLOSE_REQUIRED';
    end if;

    insert into public.branch_operating_hours(
      tenant_id,branch_id,weekday,is_closed,opens_at,closes_at,effective_from,effective_until,
      notes,created_by
    ) values(
      p_tenant_id,p_branch_id,weekday_value,closed_value,
      case when closed_value then null else opens_value end,
      case when closed_value then null else closes_value end,
      p_effective_from,null,nullif(trim(coalesce(item->>'notes','')),''),p_actor_user_id
    ) returning * into inserted_row;
    return next inserted_row;
  end loop;

  insert into public.audit_logs(
    tenant_id,membership_id,user_email,action,entity,entity_id,reason,new_data,request_id
  ) values(
    p_tenant_id,p_membership_id,coalesce((select email from auth.users where id=p_actor_user_id),'system'),
    'replace_branch_operating_hours','branches',p_branch_id::text,p_reason,
    jsonb_build_object('effective_from',p_effective_from,'hours',p_hours),gen_random_uuid()::text
  );
end $$;
revoke all on function public.replace_branch_operating_hours_v4(uuid,uuid,date,jsonb,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.replace_branch_operating_hours_v4(uuid,uuid,date,jsonb,uuid,uuid,text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Confirmação presencial de GPS com sessão curta.
-- ---------------------------------------------------------------------------
create or replace function public.validate_branch_gps_session_v4(
  p_tenant_id uuid,
  p_token_hash text,
  p_latitude numeric,
  p_longitude numeric,
  p_accuracy_meters integer,
  p_distance_meters integer,
  p_device_info text
)
returns public.gps_validation_sessions
language plpgsql
security definer
set search_path=public
as $$
declare
  validation public.gps_validation_sessions%rowtype;
  branch_row public.branches%rowtype;
begin
  select * into validation
  from public.gps_validation_sessions
  where tenant_id=p_tenant_id and token_hash=p_token_hash and status='issued'
  for update;
  if not found then raise exception 'GPS_VALIDATION_NOT_FOUND'; end if;
  if validation.expires_at<=now() then
    update public.gps_validation_sessions set status='expired' where id=validation.id;
    raise exception 'GPS_VALIDATION_EXPIRED';
  end if;

  select * into branch_row from public.branches
  where id=validation.branch_id and tenant_id=p_tenant_id for update;
  if not found then raise exception 'BRANCH_NOT_FOUND'; end if;
  if p_accuracy_meters is null or p_accuracy_meters<0 or p_accuracy_meters>greatest(150,coalesce(branch_row.allowed_radius_meters,250)) then
    update public.gps_validation_sessions
       set status='failed',latitude=p_latitude,longitude=p_longitude,accuracy_meters=p_accuracy_meters,
           distance_meters=p_distance_meters,device_info=p_device_info,validated_at=now()
     where id=validation.id returning * into validation;
    return validation;
  end if;
  if p_distance_meters is null or p_distance_meters>branch_row.allowed_radius_meters then
    update public.gps_validation_sessions
       set status='failed',latitude=p_latitude,longitude=p_longitude,accuracy_meters=p_accuracy_meters,
           distance_meters=p_distance_meters,device_info=p_device_info,validated_at=now()
     where id=validation.id returning * into validation;
    return validation;
  end if;

  update public.gps_validation_sessions
     set status='validated',latitude=p_latitude,longitude=p_longitude,accuracy_meters=p_accuracy_meters,
         distance_meters=p_distance_meters,device_info=p_device_info,validated_at=now()
   where id=validation.id returning * into validation;

  update public.branches
     set geolocation_status='confirmed',gps_ready=true,geolocation_confirmed_at=now(),
         last_gps_test_at=now(),last_inside_radius_test_at=now(),updated_at=now()
   where id=validation.branch_id and tenant_id=p_tenant_id;

  return validation;
end $$;
revoke all on function public.validate_branch_gps_session_v4(uuid,text,numeric,numeric,integer,integer,text) from public,anon,authenticated;
grant execute on function public.validate_branch_gps_session_v4(uuid,text,numeric,numeric,integer,integer,text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Ledger imutável do banco de horas.
-- ---------------------------------------------------------------------------
create or replace function public.append_hour_bank_movement_v4(
  p_tenant_id uuid,
  p_employee_id uuid,
  p_branch_id uuid,
  p_movement_date date,
  p_minutes integer,
  p_movement_type text,
  p_origin text,
  p_reason text,
  p_created_by uuid,
  p_approved_by uuid default null,
  p_expires_on date default null,
  p_reversal_of uuid default null
)
returns public.hour_bank_movements
language plpgsql
security definer
set search_path=public
as $$
declare
  previous_balance integer;
  movement public.hour_bank_movements%rowtype;
begin
  if p_tenant_id is null or p_employee_id is null or p_branch_id is null then raise exception 'SCOPE_REQUIRED'; end if;
  if p_minutes=0 then raise exception 'ZERO_MOVEMENT_NOT_ALLOWED'; end if;
  if length(trim(coalesce(p_reason,'')))<5 then raise exception 'REASON_REQUIRED'; end if;
  if not exists(select 1 from public.employees where id=p_employee_id and branch_id=p_branch_id and tenant_id=p_tenant_id) then
    raise exception 'EMPLOYEE_SCOPE_MISMATCH';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':'||p_employee_id::text,0));
  select coalesce(sum(minutes),0)::integer into previous_balance
  from public.hour_bank_movements
  where tenant_id=p_tenant_id and employee_id=p_employee_id and status in ('approved','reversed');

  insert into public.hour_bank_movements(
    tenant_id,employee_id,branch_id,movement_date,minutes,movement_type,origin,reason,
    created_by,balance_before,balance_after,expires_on,reversal_of,approved_by,approved_at,status
  ) values(
    p_tenant_id,p_employee_id,p_branch_id,coalesce(p_movement_date,current_date),p_minutes,
    coalesce(nullif(trim(p_movement_type),''),'manual_adjustment'),coalesce(nullif(trim(p_origin),''),'manual'),
    trim(p_reason),p_created_by,previous_balance,previous_balance+p_minutes,p_expires_on,p_reversal_of,
    coalesce(p_approved_by,p_created_by),now(),case when p_reversal_of is null then 'approved' else 'reversed' end
  ) returning * into movement;
  return movement;
end $$;
revoke all on function public.append_hour_bank_movement_v4(uuid,uuid,uuid,date,integer,text,text,text,uuid,uuid,date,uuid) from public,anon,authenticated;
grant execute on function public.append_hour_bank_movement_v4(uuid,uuid,uuid,date,integer,text,text,text,uuid,uuid,date,uuid) to service_role;

create or replace function public.reverse_hour_bank_movement_v4(
  p_tenant_id uuid,
  p_movement_id uuid,
  p_reason text,
  p_created_by uuid
)
returns public.hour_bank_movements
language plpgsql
security definer
set search_path=public
as $$
declare
  original public.hour_bank_movements%rowtype;
begin
  select * into original from public.hour_bank_movements
  where id=p_movement_id and tenant_id=p_tenant_id;
  if not found then raise exception 'MOVEMENT_NOT_FOUND'; end if;
  if exists(select 1 from public.hour_bank_movements where tenant_id=p_tenant_id and reversal_of=p_movement_id) then
    raise exception 'MOVEMENT_ALREADY_REVERSED';
  end if;
  return public.append_hour_bank_movement_v4(
    p_tenant_id,original.employee_id,original.branch_id,current_date,-original.minutes,
    'reversal','reversal',p_reason,p_created_by,p_created_by,null,p_movement_id
  );
end $$;
revoke all on function public.reverse_hour_bank_movement_v4(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.reverse_hour_bank_movement_v4(uuid,uuid,text,uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 5. RLS por filial nas principais tabelas operacionais.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'employees','employee_branch_authorizations','holidays','time_entries','absence_justifications',
    'payroll_periods','payroll_items','overtime_reviews','branch_operating_hours','shift_templates',
    'holiday_operation_decisions','admin_notifications','branch_qr_tokens','branch_geolocation_history',
    'gps_validation_sessions','authorized_devices','work_sessions','schedule_publications',
    'schedule_occurrences','coverage_requirements','clock_attempts'
  ] loop
    if to_regclass('public.'||t) is null then continue; end if;
    execute format('drop policy if exists tenant_read on public.%I',t);
    execute format('drop policy if exists tenant_write on public.%I',t);
    execute format(
      'create policy tenant_branch_read on public.%I for select to authenticated using (tenant_id=public.current_tenant_id() and (branch_id is null or public.can_access_branch(tenant_id,branch_id)))',t
    );
    execute format(
      'create policy tenant_branch_write on public.%I for all to authenticated using (tenant_id=public.current_tenant_id() and (branch_id is null or public.can_access_branch(tenant_id,branch_id)) and public.is_tenant_admin_member(tenant_id)) with check (tenant_id=public.current_tenant_id() and (branch_id is null or public.can_access_branch(tenant_id,branch_id)) and public.is_tenant_admin_member(tenant_id))',t
    );
  end loop;
end $$;

-- Tabelas filhas sem branch_id usam o escopo da entidade pai.
drop policy if exists tenant_read on public.employee_salary_history;
drop policy if exists tenant_write on public.employee_salary_history;
create policy tenant_employee_salary_read on public.employee_salary_history for select to authenticated
  using(tenant_id=public.current_tenant_id() and public.can_access_employee(tenant_id,employee_id));
create policy tenant_employee_salary_write on public.employee_salary_history for all to authenticated
  using(tenant_id=public.current_tenant_id() and public.can_access_employee(tenant_id,employee_id) and public.is_tenant_admin_member(tenant_id))
  with check(tenant_id=public.current_tenant_id() and public.can_access_employee(tenant_id,employee_id) and public.is_tenant_admin_member(tenant_id));

-- Defaults operacionais por tenant existente.
insert into public.tenant_settings(tenant_id,key,value)
select id,'outside_operating_hours_policy','"require_justification"'::jsonb from public.tenants
on conflict(tenant_id,key) do nothing;
insert into public.tenant_features(tenant_id,feature_key,enabled,config)
select id,'offline_clock',false,'{"maxOfflineMinutes":120,"requiresDevice":true}'::jsonb from public.tenants
on conflict(tenant_id,feature_key) do nothing;
