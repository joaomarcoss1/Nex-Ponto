-- NexPonto v4.0 — remediação multiempresa, segurança, jornada profissional e operação móvel.
-- Esta migration é corretiva e deve ser aplicada depois da 020. Não contém dados pessoais.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Estados SaaS, identidade e contexto explícito
-- ---------------------------------------------------------------------------

do $$
begin
  alter type public.admin_role add value if not exists 'tenant_owner';
  alter type public.admin_role add value if not exists 'tenant_admin';
  alter type public.admin_role add value if not exists 'rh_admin';
  alter type public.admin_role add value if not exists 'rh_analyst';
  alter type public.admin_role add value if not exists 'finance_admin';
  alter type public.admin_role add value if not exists 'regional_manager';
  alter type public.admin_role add value if not exists 'branch_manager';
  alter type public.admin_role add value if not exists 'department_leader';
  alter type public.admin_role add value if not exists 'auditor';
exception when duplicate_object then null;
end $$;

alter table public.tenants drop constraint if exists tenants_status_check;
alter table public.tenants add constraint tenants_status_check
  check (status in ('draft','onboarding','pending_validation','trial','active','suspended','cancelled','archived'));
alter table public.tenants drop constraint if exists tenants_onboarding_status_check;
alter table public.tenants add constraint tenants_onboarding_status_check
  check (onboarding_status in ('pending','in_progress','ready','blocked'));
alter table public.tenants
  add column if not exists public_access_code text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;
create unique index if not exists uq_tenants_public_access_code
  on public.tenants(public_access_code) where public_access_code is not null;
update public.tenants set public_access_code = encode(gen_random_bytes(12),'hex') where public_access_code is null;

create table if not exists public.tenant_member_branches (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  membership_id uuid not null references public.tenant_memberships(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (membership_id, branch_id)
);
create index if not exists idx_tenant_member_branches_tenant_branch
  on public.tenant_member_branches(tenant_id, branch_id, membership_id);

insert into public.tenant_member_branches(tenant_id,membership_id,branch_id)
select tm.tenant_id, tm.id, branch_id
from public.tenant_memberships tm
cross join lateral unnest(coalesce(tm.branch_ids,'{}'::uuid[])) branch_id
on conflict do nothing;

create or replace function public.current_tenant_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  claim_value text;
  membership_tenant uuid;
  membership_count integer;
begin
  claim_value := nullif(auth.jwt() -> 'app_metadata' ->> 'active_tenant_id','');
  if claim_value is not null then
    begin
      membership_tenant := claim_value::uuid;
    exception when invalid_text_representation then
      membership_tenant := null;
    end;
    if membership_tenant is not null and exists (
      select 1 from public.tenant_memberships tm
      where tm.tenant_id = membership_tenant and tm.auth_user_id = auth.uid() and tm.active
    ) then
      return membership_tenant;
    end if;
  end if;

  select count(*), min(tm.tenant_id)
    into membership_count, membership_tenant
  from public.tenant_memberships tm
  where tm.auth_user_id = auth.uid() and tm.active;

  if membership_count = 1 then return membership_tenant; end if;
  return null;
end $$;

create or replace function public.current_membership_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select tm.id
  from public.tenant_memberships tm
  where tm.auth_user_id = auth.uid()
    and tm.tenant_id = public.current_tenant_id()
    and tm.active
  limit 1
$$;

create or replace function public.is_tenant_member(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists(
    select 1 from public.tenant_memberships tm
    where tm.auth_user_id=auth.uid() and tm.tenant_id=p_tenant_id and tm.active
  )
$$;

create or replace function public.is_tenant_admin_member(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists(
    select 1 from public.tenant_memberships tm
    where tm.auth_user_id=auth.uid() and tm.tenant_id=p_tenant_id and tm.active
      and tm.role in (
        'tenant_owner','tenant_admin','rh_admin','rh_analyst','finance_admin',
        'regional_manager','branch_manager','department_leader',
        'master_admin','admin','admin_geral','gerente_filial','rh_financeiro'
      )
  )
$$;

create or replace function public.can_access_branch(p_tenant_id uuid,p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists(
    select 1
    from public.tenant_memberships tm
    where tm.auth_user_id=auth.uid() and tm.tenant_id=p_tenant_id and tm.active
      and (
        tm.role in ('tenant_owner','tenant_admin','rh_admin','rh_analyst','finance_admin','regional_manager','master_admin','admin','admin_geral','rh_financeiro')
        or p_branch_id = any(tm.branch_ids)
        or exists (
          select 1 from public.tenant_member_branches tmb
          where tmb.membership_id=tm.id and tmb.tenant_id=p_tenant_id and tmb.branch_id=p_branch_id
        )
      )
  )
$$;

create or replace function public.can_access_employee(p_tenant_id uuid,p_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists(
    select 1 from public.employees e
    where e.id=p_employee_id and e.tenant_id=p_tenant_id
      and public.can_access_branch(p_tenant_id,e.branch_id)
  )
$$;

-- ---------------------------------------------------------------------------
-- 2. Unicidade por tenant e configurações realmente tenantizadas
-- ---------------------------------------------------------------------------

alter table public.admin_users drop constraint if exists admin_users_email_key;
drop index if exists public.idx_branches_code_unique;
drop index if exists public.idx_employees_document_unique;
drop index if exists public.idx_employees_registration_code_unique;

create unique index if not exists uq_admin_users_tenant_email
  on public.admin_users(tenant_id,lower(email));
create unique index if not exists uq_branches_tenant_code
  on public.branches(tenant_id,lower(code)) where code is not null and code<>'';
create unique index if not exists uq_employees_tenant_document
  on public.employees(tenant_id,document) where document is not null and document<>'';
create unique index if not exists uq_employees_tenant_registration
  on public.employees(tenant_id,registration_code) where registration_code is not null and registration_code<>'';

alter table public.system_settings drop constraint if exists system_settings_pkey;
alter table public.system_settings add constraint system_settings_pkey primary key (tenant_id,key);

-- Token QR deixa de ter unicidade global e passa a armazenar apenas hash.
alter table public.branch_qr_tokens
  add column if not exists token_hash text,
  add column if not exists token_prefix text,
  add column if not exists rotation_group uuid,
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by uuid references auth.users(id) on delete set null,
  add column if not exists last_used_at timestamptz,
  add column if not exists use_count integer not null default 0,
  add column if not exists replay_window_seconds integer not null default 30;
update public.branch_qr_tokens
set valid_until = coalesce(valid_until,created_at + interval '12 hours'),
    token_hash = coalesce(token_hash,encode(digest(token,'sha256'),'hex')),
    token_prefix = coalesce(token_prefix,left(token,8)),
    rotation_group = coalesce(rotation_group,gen_random_uuid())
where token_hash is null or valid_until is null or rotation_group is null;
alter table public.branch_qr_tokens alter column valid_until set not null;
alter table public.branch_qr_tokens alter column token_hash set not null;
alter table public.branch_qr_tokens drop constraint if exists branch_qr_tokens_token_key;
drop index if exists public.branch_qr_tokens_token_key;
create unique index if not exists uq_branch_qr_tenant_hash on public.branch_qr_tokens(tenant_id,token_hash);

-- ---------------------------------------------------------------------------
-- 3. Operação profissional: onboarding, GPS, dispositivos, jornada e escala
-- ---------------------------------------------------------------------------

create table if not exists public.tenant_onboarding_steps (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  step_key text not null,
  status text not null default 'pending' check (status in ('pending','in_progress','completed','blocked','skipped')),
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  evidence jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique(tenant_id,step_key)
);

create table if not exists public.gps_validation_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  token_hash text not null,
  status text not null default 'issued' check (status in ('issued','validated','expired','revoked','failed')),
  expires_at timestamptz not null,
  latitude numeric(10,7),
  longitude numeric(10,7),
  accuracy_meters integer,
  distance_meters integer,
  device_info text,
  issued_by uuid references auth.users(id) on delete set null,
  validated_by uuid references auth.users(id) on delete set null,
  validated_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);
create unique index if not exists uq_gps_validation_tenant_hash on public.gps_validation_sessions(tenant_id,token_hash);

create table if not exists public.authorized_devices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete cascade,
  device_key_hash text not null,
  display_name text not null,
  status text not null default 'active' check (status in ('pending','active','revoked','blocked')),
  last_used_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(tenant_id,device_key_hash)
);

create table if not exists public.work_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  schedule_id uuid references public.work_schedules(id) on delete set null,
  work_date date not null,
  timezone text not null,
  status text not null default 'open' check (status in ('open','completed','pending_review','cancelled')),
  expected_start_at timestamptz,
  expected_end_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  schedule_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_work_sessions_open_employee
  on public.work_sessions(tenant_id,employee_id) where status='open';
create index if not exists idx_work_sessions_tenant_employee_date
  on public.work_sessions(tenant_id,employee_id,work_date desc);

alter table public.time_entries
  add column if not exists work_session_id uuid references public.work_sessions(id) on delete set null,
  add column if not exists event_sequence integer,
  add column if not exists client_timestamp timestamptz,
  add column if not exists server_timestamp timestamptz not null default now(),
  add column if not exists device_id uuid references public.authorized_devices(id) on delete set null,
  add column if not exists offline_status text not null default 'online' check (offline_status in ('online','pending_sync','synced','review','rejected'));
create index if not exists idx_time_entries_tenant_session_sequence
  on public.time_entries(tenant_id,work_session_id,event_sequence);

create table if not exists public.work_session_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  work_session_id uuid not null references public.work_sessions(id) on delete cascade,
  time_entry_id uuid references public.time_entries(id) on delete set null,
  event_type text not null check (event_type in ('clock_in','break_start','break_end','clock_out','manual_adjustment')),
  break_type text,
  sequence integer not null,
  occurred_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(work_session_id,sequence)
);

create table if not exists public.shift_template_intervals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  shift_template_id uuid not null references public.shift_templates(id) on delete cascade,
  interval_type text not null default 'meal',
  sequence integer not null,
  planned_start time,
  start_window_min time,
  start_window_max time,
  expected_minutes integer not null default 60 check (expected_minutes >= 0),
  minimum_minutes integer not null default 0 check (minimum_minutes >= 0),
  maximum_minutes integer check (maximum_minutes is null or maximum_minutes >= minimum_minutes),
  paid boolean not null default false,
  required boolean not null default true,
  requires_clock boolean not null default true,
  tolerance_minutes integer not null default 0 check (tolerance_minutes >= 0),
  created_at timestamptz not null default now(),
  unique(shift_template_id,sequence)
);

create table if not exists public.schedule_cycles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  code text,
  cycle_length_days integer not null check (cycle_length_days between 1 and 90),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,code)
);

create table if not exists public.schedule_cycle_days (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  cycle_id uuid not null references public.schedule_cycles(id) on delete cascade,
  day_index integer not null check (day_index >= 0),
  shift_template_id uuid references public.shift_templates(id) on delete set null,
  is_day_off boolean not null default false,
  notes text,
  unique(cycle_id,day_index)
);

alter table public.work_schedules
  add column if not exists cycle_id uuid references public.schedule_cycles(id) on delete set null,
  add column if not exists publication_id uuid,
  add column if not exists source_type text not null default 'contract' check (source_type in ('exception','published','cycle','contract','fallback'));

create table if not exists public.schedule_publications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  version integer not null default 1,
  status text not null default 'draft' check (status in ('draft','validated','published','superseded','cancelled')),
  published_at timestamptz,
  published_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(period_end>=period_start),
  unique(tenant_id,branch_id,period_start,period_end,version)
);

create table if not exists public.schedule_occurrences (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  publication_id uuid not null references public.schedule_publications(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  work_date date not null,
  shift_template_id uuid references public.shift_templates(id) on delete set null,
  starts_at timestamptz,
  ends_at timestamptz,
  is_day_off boolean not null default false,
  intervals jsonb not null default '[]'::jsonb,
  status text not null default 'planned' check (status in ('planned','published','cancelled','completed')),
  created_at timestamptz not null default now(),
  unique(publication_id,employee_id,work_date)
);

create table if not exists public.coverage_requirements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  sector text,
  role text,
  weekday integer check (weekday between 0 and 6),
  specific_date date,
  starts_at time not null,
  ends_at time not null,
  minimum_people integer not null check (minimum_people >= 0),
  effective_from date not null default current_date,
  effective_until date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check(effective_until is null or effective_until>=effective_from)
);

-- ---------------------------------------------------------------------------
-- 4. Segurança distribuída, jobs, tentativas e auditoria
-- ---------------------------------------------------------------------------

create table if not exists public.distributed_rate_limits (
  bucket_key text primary key,
  attempts integer not null default 0,
  window_started_at timestamptz not null default now(),
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);

create or replace function public.consume_rate_limit(
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer,
  p_block_seconds integer default 300
)
returns table(allowed boolean,remaining integer,retry_after_seconds integer)
language plpgsql
security definer
set search_path=public
as $$
declare
  row_value public.distributed_rate_limits%rowtype;
  now_value timestamptz := clock_timestamp();
begin
  insert into public.distributed_rate_limits(bucket_key,attempts,window_started_at,updated_at)
  values(p_bucket_key,0,now_value,now_value)
  on conflict(bucket_key) do nothing;

  select * into row_value from public.distributed_rate_limits where bucket_key=p_bucket_key for update;

  if row_value.blocked_until is not null and row_value.blocked_until>now_value then
    return query select false,0,ceil(extract(epoch from row_value.blocked_until-now_value))::integer;
    return;
  end if;

  if row_value.window_started_at + make_interval(secs=>p_window_seconds) <= now_value then
    row_value.attempts := 0;
    row_value.window_started_at := now_value;
  end if;

  row_value.attempts := row_value.attempts + 1;
  if row_value.attempts > p_limit then
    row_value.blocked_until := now_value + make_interval(secs=>p_block_seconds);
    update public.distributed_rate_limits
       set attempts=row_value.attempts,window_started_at=row_value.window_started_at,
           blocked_until=row_value.blocked_until,updated_at=now_value
     where bucket_key=p_bucket_key;
    return query select false,0,p_block_seconds;
    return;
  end if;

  update public.distributed_rate_limits
     set attempts=row_value.attempts,window_started_at=row_value.window_started_at,
         blocked_until=null,updated_at=now_value
   where bucket_key=p_bucket_key;
  return query select true,greatest(0,p_limit-row_value.attempts),0;
end $$;
revoke all on function public.consume_rate_limit(text,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.consume_rate_limit(text,integer,integer,integer) to service_role;

create table if not exists public.clock_attempts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  branch_id uuid references public.branches(id) on delete set null,
  requested_action text,
  attempted_at timestamptz not null default now(),
  latitude numeric(10,7),
  longitude numeric(10,7),
  accuracy_meters integer,
  distance_meters integer,
  block_reason text,
  idempotency_key text,
  device_info text,
  evidence jsonb not null default '{}'::jsonb,
  resolved_time_entry_id uuid references public.time_entries(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(tenant_id,idempotency_key)
);

alter table public.audit_logs
  add column if not exists membership_id uuid references public.tenant_memberships(id) on delete set null,
  add column if not exists branch_id uuid references public.branches(id) on delete set null,
  add column if not exists reason text,
  add column if not exists request_id text,
  add column if not exists ip_hash text,
  add column if not exists user_agent text;

create table if not exists public.background_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  job_type text not null,
  idempotency_key text not null,
  status text not null default 'queued' check (status in ('queued','running','completed','failed','dead_letter','cancelled')),
  progress integer not null default 0 check(progress between 0 and 100),
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error_code text,
  error_message text,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  run_after timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,idempotency_key)
);

create table if not exists public.report_exports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  report_type text not null,
  format text not null check(format in ('pdf','xlsx','csv')),
  filters jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check(status in ('queued','processing','ready','failed','expired')),
  job_id uuid references public.background_jobs(id) on delete set null,
  storage_path text,
  expires_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.employee_portal_notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  title text not null,
  message text not null,
  notification_type text not null default 'info',
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- Banco de horas: movimentos antigos permanecem, mas tornam-se imutáveis.
alter table public.hour_bank_movements
  add column if not exists balance_before integer,
  add column if not exists balance_after integer,
  add column if not exists expires_on date,
  add column if not exists reversal_of uuid references public.hour_bank_movements(id) on delete set null,
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists status text not null default 'approved' check(status in ('pending','approved','reversed','expired'));

create or replace function public.prevent_hour_bank_mutation()
returns trigger language plpgsql set search_path=public as $$
begin
  raise exception 'HOUR_BANK_LEDGER_IMMUTABLE';
end $$;
drop trigger if exists trg_hour_bank_immutable_update on public.hour_bank_movements;
create trigger trg_hour_bank_immutable_update before update or delete on public.hour_bank_movements
for each row execute function public.prevent_hour_bank_mutation();

-- ---------------------------------------------------------------------------
-- 5. Integridade automática de tenant e relações
-- ---------------------------------------------------------------------------

create or replace function public.enforce_tenant_relation()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  relation_table regclass := to_regclass('public.'||tg_argv[0]);
  relation_column text := tg_argv[1];
  relation_id uuid;
  relation_tenant uuid;
begin
  relation_id := (to_jsonb(new)->>relation_column)::uuid;
  if relation_id is null then return new; end if;
  execute format('select tenant_id from %s where id=$1',relation_table) into relation_tenant using relation_id;
  if relation_tenant is null then raise exception 'TENANT_RELATION_NOT_FOUND'; end if;
  if new.tenant_id is null then new.tenant_id := relation_tenant; end if;
  if new.tenant_id<>relation_tenant then raise exception 'TENANT_RELATION_MISMATCH'; end if;
  return new;
end $$;

-- Corrige o trigger amplo da 020: nem todas as tabelas possuem branch_id.
do $$
declare
  item record;
begin
  for item in select event_object_table,trigger_name from information_schema.triggers
    where trigger_schema='public' and trigger_name like 'trg_%_tenant_branch'
  loop
    execute format('drop trigger if exists %I on public.%I',item.trigger_name,item.event_object_table);
  end loop;
end $$;

-- Relações por filial.
do $$
declare t text;
begin
  foreach t in array array[
    'employees','employee_branch_authorizations','holidays','time_entries','absence_justifications',
    'payroll_periods','payroll_items','overtime_reviews','branch_operating_hours','shift_templates',
    'holiday_operation_decisions','admin_notifications','branch_qr_tokens','branch_geolocation_history',
    'gps_validation_sessions','authorized_devices','work_sessions','schedule_publications',
    'schedule_occurrences','coverage_requirements','clock_attempts'
  ] loop
    if to_regclass('public.'||t) is not null then
      execute format('drop trigger if exists trg_%I_tenant_branch on public.%I',t,t);
      execute format('create trigger trg_%I_tenant_branch before insert or update of tenant_id,branch_id on public.%I for each row execute function public.enforce_tenant_relation(''branches'',''branch_id'')',t,t);
    end if;
  end loop;
end $$;

-- Relações por funcionário nas tabelas sem filial obrigatória.
do $$
declare t text;
begin
  foreach t in array array['employee_salary_history','work_schedules','hour_bank_movements','shift_requests','employee_portal_notifications'] loop
    if to_regclass('public.'||t) is not null then
      execute format('drop trigger if exists trg_%I_tenant_employee on public.%I',t,t);
      execute format('create trigger trg_%I_tenant_employee before insert or update of tenant_id,employee_id on public.%I for each row execute function public.enforce_tenant_relation(''employees'',''employee_id'')',t,t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 6. RLS consolidado: remove policies legadas permissivas e recria isolamento.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
  p record;
  tenant_tables text[] := array[
    'admin_users','branches','employees','employee_salary_history','work_schedules','employee_branch_authorizations',
    'holidays','time_entries','absence_justifications','payroll_periods','payroll_items','overtime_reviews',
    'audit_logs','system_settings','pin_attempt_logs','branch_operating_hours','shift_templates',
    'holiday_operation_decisions','employee_import_batches','hour_bank_movements','shift_requests',
    'admin_notifications','branch_qr_tokens','payroll_closure_checks','payroll_homologation_checks',
    'branch_geolocation_history','report_export_logs','tenant_onboarding_steps','gps_validation_sessions',
    'authorized_devices','work_sessions','work_session_events','shift_template_intervals','schedule_cycles',
    'schedule_cycle_days','schedule_publications','schedule_occurrences','coverage_requirements','clock_attempts',
    'background_jobs','report_exports','employee_portal_notifications','tenant_member_branches'
  ];
begin
  foreach t in array tenant_tables loop
    if to_regclass('public.'||t) is null then continue; end if;
    execute format('alter table public.%I enable row level security',t);
    for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy if exists %I on public.%I',p.policyname,t);
    end loop;
    execute format(
      'create policy tenant_read on public.%I for select to authenticated using (tenant_id=public.current_tenant_id() and (public.is_tenant_admin_member(tenant_id) or public.has_tenant_role(tenant_id,array[''auditor''])))',t
    );
    execute format(
      'create policy tenant_write on public.%I for all to authenticated using (tenant_id=public.current_tenant_id() and public.is_tenant_admin_member(tenant_id)) with check (tenant_id=public.current_tenant_id() and public.is_tenant_admin_member(tenant_id))',t
    );
  end loop;
end $$;

-- Policies próprias das tabelas globais/SaaS.
do $$ declare p record; t text; begin
 foreach t in array array['tenants','tenant_memberships','tenant_settings','tenant_branding','tenant_features','tenant_domains','tenant_usage','tenant_subscriptions','support_access_sessions','platform_audit_logs','platform_superadmins'] loop
   if to_regclass('public.'||t) is not null then
     for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
       execute format('drop policy if exists %I on public.%I',p.policyname,t);
     end loop;
   end if;
 end loop;
end $$;

create policy tenants_member_read on public.tenants for select to authenticated
  using(public.is_tenant_member(id) or public.is_platform_superadmin());
create policy memberships_self_read on public.tenant_memberships for select to authenticated
  using(auth_user_id=auth.uid() or public.is_platform_superadmin());
create policy tenant_settings_admin on public.tenant_settings for all to authenticated
  using(tenant_id=public.current_tenant_id() and public.is_tenant_admin_member(tenant_id))
  with check(tenant_id=public.current_tenant_id() and public.is_tenant_admin_member(tenant_id));
create policy tenant_branding_member_read on public.tenant_branding for select to authenticated
  using(tenant_id=public.current_tenant_id());
create policy tenant_branding_admin_write on public.tenant_branding for all to authenticated
  using(tenant_id=public.current_tenant_id() and public.is_tenant_admin_member(tenant_id))
  with check(tenant_id=public.current_tenant_id() and public.is_tenant_admin_member(tenant_id));
create policy tenant_features_member_read on public.tenant_features for select to authenticated
  using(tenant_id=public.current_tenant_id() or public.is_platform_superadmin());
create policy tenant_domains_member_read on public.tenant_domains for select to authenticated
  using(tenant_id=public.current_tenant_id() or public.is_platform_superadmin());
create policy tenant_usage_member_read on public.tenant_usage for select to authenticated
  using(tenant_id=public.current_tenant_id() or public.is_platform_superadmin());
create policy tenant_subscriptions_member_read on public.tenant_subscriptions for select to authenticated
  using(tenant_id=public.current_tenant_id() or public.is_platform_superadmin());
create policy support_sessions_parties on public.support_access_sessions for select to authenticated
  using(tenant_id=public.current_tenant_id() or public.is_platform_superadmin());
create policy platform_audit_superadmin on public.platform_audit_logs for select to authenticated
  using(public.is_platform_superadmin());
create policy platform_superadmins_self on public.platform_superadmins for select to authenticated
  using(auth_user_id=auth.uid());

-- Indexação crítica multiempresa.
create index if not exists idx_time_entries_tenant_employee_date on public.time_entries(tenant_id,employee_id,entry_date,entry_timestamp);
create index if not exists idx_work_schedules_tenant_employee_effective on public.work_schedules(tenant_id,employee_id,effective_from,effective_until,active);
create index if not exists idx_payroll_periods_tenant_dates_status on public.payroll_periods(tenant_id,start_date,end_date,status);
create index if not exists idx_hour_bank_tenant_employee_date on public.hour_bank_movements(tenant_id,employee_id,movement_date,created_at);
create index if not exists idx_audit_logs_tenant_created on public.audit_logs(tenant_id,created_at desc);
create index if not exists idx_clock_attempts_tenant_employee_date on public.clock_attempts(tenant_id,employee_id,attempted_at desc);

-- Inicializa onboarding para tenants existentes.
insert into public.tenant_onboarding_steps(tenant_id,step_key,status)
select t.id,step_key,'pending'
from public.tenants t
cross join unnest(array['company','branding','first_branch','operating_hours','clock_policy','admin_team','gps_test','qr_test','activation']) step_key
on conflict do nothing;

comment on table public.work_sessions is 'Agrupa eventos de uma jornada no timezone da filial, inclusive turnos que atravessam meia-noite.';
comment on table public.schedule_publications is 'Versões publicadas do planejamento semanal por filial.';
comment on table public.hour_bank_movements is 'Ledger imutável; correções são feitas por estorno e novo movimento.';
