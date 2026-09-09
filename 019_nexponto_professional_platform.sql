-- NexPonto 2.0 — fundação profissional, horários de unidade, turnos e integridade.

alter table public.branches
  add column if not exists code text,
  add column if not exists timezone text not null default 'America/Sao_Paulo',
  add column if not exists responsible_name text,
  add column if not exists phone text;

create unique index if not exists idx_branches_code_unique
  on public.branches(lower(code))
  where code is not null and code <> '';

create table if not exists public.branch_operating_hours (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  weekday integer not null check (weekday between 0 and 6),
  is_closed boolean not null default false,
  opens_at time,
  closes_at time,
  effective_from date not null default current_date,
  effective_until date,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint branch_operating_hours_period_valid
    check (effective_until is null or effective_until >= effective_from),
  constraint branch_operating_hours_times_valid
    check (is_closed or (opens_at is not null and closes_at is not null))
);

create unique index if not exists idx_branch_operating_hours_version
  on public.branch_operating_hours(branch_id, weekday, effective_from);

create index if not exists idx_branch_operating_hours_lookup
  on public.branch_operating_hours(branch_id, weekday, effective_from desc, effective_until);

drop trigger if exists branch_operating_hours_updated_at on public.branch_operating_hours;
create trigger branch_operating_hours_updated_at
before update on public.branch_operating_hours
for each row execute function public.set_updated_at();

create table if not exists public.shift_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  branch_id uuid references public.branches(id) on delete cascade,
  role text,
  sector text,
  starts_at time not null,
  ends_at time not null,
  crosses_midnight boolean not null default false,
  expected_daily_minutes integer not null check (expected_daily_minutes between 1 and 1440),
  breaks jsonb not null default '[]'::jsonb,
  color text not null default '#1268F3',
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shift_templates_breaks_array check (jsonb_typeof(breaks) = 'array')
);

create index if not exists idx_shift_templates_branch_active
  on public.shift_templates(branch_id, active, name);

drop trigger if exists shift_templates_updated_at on public.shift_templates;
create trigger shift_templates_updated_at
before update on public.shift_templates
for each row execute function public.set_updated_at();

alter table public.work_schedules
  add column if not exists shift_template_id uuid references public.shift_templates(id) on delete set null,
  add column if not exists breaks jsonb not null default '[]'::jsonb,
  add column if not exists crosses_midnight boolean not null default false,
  add column if not exists version integer not null default 1,
  add column if not exists published_at timestamptz,
  add column if not exists published_by uuid references auth.users(id) on delete set null;

alter table public.payroll_items
  add column if not exists base_calculation_rule text,
  add column if not exists eligible_calendar_days integer not null default 0,
  add column if not exists period_calendar_days integer not null default 0,
  add column if not exists eligibility_ratio numeric(12,6) not null default 1,
  add column if not exists paid_holiday_days integer not null default 0;

alter table public.work_schedules
  drop constraint if exists work_schedules_breaks_array;
alter table public.work_schedules
  add constraint work_schedules_breaks_array check (jsonb_typeof(breaks) = 'array');

-- Remove qualquer PIN que tenha sido persistido em lotes de importação por versões antigas.
update public.employee_import_batches
set summary = '[]'::jsonb
where summary is not null and summary <> '[]'::jsonb;

-- Ajuste de ponto atômico: preserva o original, remove a chave idempotente da cópia e faz rollback em falha.
create or replace function public.adjust_time_entry_transactional(
  p_entry_id uuid,
  p_adjusted_by uuid,
  p_entry_timestamp timestamptz,
  p_entry_date date,
  p_action public.time_action,
  p_status public.time_entry_status,
  p_reason text,
  p_late_minutes integer default 0,
  p_early_leave_minutes integer default 0,
  p_justification_text text default null,
  p_review_flags text[] default '{}'
)
returns public.time_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  original public.time_entries%rowtype;
  replacement public.time_entries%rowtype;
begin
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Todo ajuste exige um motivo com pelo menos 5 caracteres.';
  end if;

  select * into original
  from public.time_entries
  where id = p_entry_id
  for update;

  if not found then
    raise exception 'Ponto não encontrado.';
  end if;

  update public.time_entries
  set status = 'canceled',
      occurrence_review_status = 'cancelled',
      adjustment_reason = 'Substituído por ajuste: ' || trim(p_reason),
      adjusted_by = p_adjusted_by,
      adjusted_at = now()
  where id = p_entry_id;

  replacement := original;
  replacement.id := gen_random_uuid();
  replacement.entry_timestamp := p_entry_timestamp;
  replacement.entry_date := p_entry_date;
  replacement.action := p_action;
  replacement.status := p_status;
  replacement.late_minutes := greatest(0, coalesce(p_late_minutes, 0));
  replacement.early_leave_minutes := greatest(0, coalesce(p_early_leave_minutes, 0));
  replacement.justification_text := p_justification_text;
  replacement.review_flags := coalesce(p_review_flags, '{}');
  replacement.idempotency_key := null;
  replacement.original_entry_id := p_entry_id;
  replacement.adjustment_reason := trim(p_reason);
  replacement.adjusted_by := p_adjusted_by;
  replacement.adjusted_at := now();
  replacement.created_at := now();
  replacement.occurrence_review_status :=
    case when p_status = 'canceled' then 'cancelled' else 'adjusted' end;

  insert into public.time_entries
  select (replacement).*
  returning * into replacement;

  return replacement;
end;
$$;

revoke all on function public.adjust_time_entry_transactional(
  uuid, uuid, timestamptz, date, public.time_action, public.time_entry_status,
  text, integer, integer, text, text[]
) from public, anon, authenticated;
grant execute on function public.adjust_time_entry_transactional(
  uuid, uuid, timestamptz, date, public.time_action, public.time_entry_status,
  text, integer, integer, text, text[]
) to service_role;

alter table public.branch_operating_hours enable row level security;
alter table public.shift_templates enable row level security;

drop policy if exists "admins manage branch operating hours" on public.branch_operating_hours;
create policy "admins manage branch operating hours"
on public.branch_operating_hours
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins manage shift templates" on public.shift_templates;
create policy "admins manage shift templates"
on public.shift_templates
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'nexponto-branding',
  'nexponto-branding',
  true,
  2097152,
  array['image/png','image/jpeg','image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

insert into public.system_settings (key, value) values
  ('app_name', '"NexPonto"'::jsonb),
  ('app_short_name', '"NexPonto"'::jsonb),
  ('app_tagline', '"Gestão inteligente de jornadas"'::jsonb),
  ('logo_url', '"/nexponto-logo.svg"'::jsonb),
  ('mark_url', '"/nexponto-mark.svg"'::jsonb),
  ('primary_color', '"#1268F3"'::jsonb),
  ('secondary_color', '"#F4B51C"'::jsonb),
  ('accent_color', '"#22A5F5"'::jsonb),
  ('background_color', '"#F5F7FB"'::jsonb),
  ('surface_color', '"#FFFFFF"'::jsonb)
on conflict (key) do nothing;

-- Troca todos os itens calculados de uma pré-folha na mesma transação.
-- Em caso de falha, o PostgreSQL preserva integralmente a memória anterior.
create or replace function public.replace_payroll_items_transactional(
  p_period_id uuid,
  p_items jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer := 0;
  normalized_items jsonb := '[]'::jsonb;
begin
  if not exists (
    select 1
    from public.payroll_periods
    where id = p_period_id
      and status::text in ('draft', 'incomplete_preview', 'checking', 'ready', 'reviewed', 'reopened')
  ) then
    raise exception 'Período inexistente ou imutável';
  end if;

  delete from public.payroll_closure_checks where payroll_period_id = p_period_id;
  delete from public.payroll_items where payroll_period_id = p_period_id;

  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 0 then
    select jsonb_agg(
      item || jsonb_build_object(
        'id', gen_random_uuid(),
        'created_at', now()
      )
    )
    into normalized_items
    from jsonb_array_elements(p_items) as source(item);

    insert into public.payroll_items
    select *
    from jsonb_populate_recordset(null::public.payroll_items, normalized_items);
    get diagnostics inserted_count = row_count;
  end if;

  return inserted_count;
end;
$$;

revoke all on function public.replace_payroll_items_transactional(uuid, jsonb) from public;
grant execute on function public.replace_payroll_items_transactional(uuid, jsonb) to service_role;

alter table public.shift_requests
  add column if not exists end_date date,
  add column if not exists requested_start_time time,
  add column if not exists requested_end_time time,
  add column if not exists requested_lunch_start_time time,
  add column if not exists requested_lunch_end_time time,
  add column if not exists requested_minutes integer not null default 0,
  add column if not exists applied_entity_type text,
  add column if not exists applied_entity_id uuid,
  add column if not exists applied_at timestamptz;

update public.shift_requests
set end_date = request_date
where end_date is null;

create or replace function public.review_shift_request_transactional(
  p_request_id uuid,
  p_status text,
  p_observation text,
  p_reviewer_id uuid
)
returns public.shift_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.shift_requests;
  effect_id uuid;
  employee_days integer[];
  reviewer_auth_user_id uuid;
  shift_minutes integer;
  lunch_minutes integer := 0;
begin
  select * into request_row
  from public.shift_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Solicitação não encontrada';
  end if;
  select auth_user_id into reviewer_auth_user_id
  from public.admin_users
  where id = p_reviewer_id;
  if p_status not in ('pending', 'approved_manager', 'approved_hr', 'rejected', 'canceled') then
    raise exception 'Status de solicitação inválido';
  end if;
  if request_row.status = 'approved_hr' and p_status <> 'approved_hr' then
    raise exception 'Solicitação já aplicada é imutável';
  end if;

  if p_status = 'approved_hr' and request_row.applied_at is null then
    if request_row.request_type = 'outra_filial' then
      if request_row.target_branch_id is null then
        raise exception 'Selecione a filial de destino';
      end if;
      insert into public.employee_branch_authorizations (
        employee_id, branch_id, starts_on, ends_on, reason, active, created_by
      ) values (
        request_row.employee_id,
        request_row.target_branch_id,
        request_row.request_date,
        coalesce(request_row.end_date, request_row.request_date),
        request_row.reason,
        true,
        reviewer_auth_user_id
      ) returning id into effect_id;
      request_row.applied_entity_type := 'employee_branch_authorization';

    elsif request_row.request_type = 'folga' then
      insert into public.absence_justifications (
        employee_id, branch_id, absence_date, justification_text,
        status, admin_observation, reviewed_at
      ) values (
        request_row.employee_id,
        request_row.branch_id,
        request_row.request_date,
        request_row.reason,
        'approved',
        p_observation,
        now()
      ) returning id into effect_id;
      request_row.applied_entity_type := 'absence_justification';

    elsif request_row.request_type = 'compensacao' then
      if request_row.requested_minutes = 0 then
        raise exception 'Informe os minutos positivos ou negativos da compensação';
      end if;
      insert into public.hour_bank_movements (
        employee_id, branch_id, movement_date, minutes,
        movement_type, origin, reason, created_by
      ) values (
        request_row.employee_id,
        request_row.branch_id,
        request_row.request_date,
        request_row.requested_minutes,
        'approved_compensation',
        'shift_request',
        request_row.reason,
        p_reviewer_id
      ) returning id into effect_id;
      request_row.applied_entity_type := 'hour_bank_movement';

    elsif request_row.request_type = 'troca_turno' then
      if request_row.requested_start_time is null or request_row.requested_end_time is null then
        raise exception 'Informe entrada e saída do novo turno';
      end if;
      select work_days into employee_days
      from public.employees
      where id = request_row.employee_id;

      shift_minutes := round(extract(epoch from (
        request_row.requested_end_time - request_row.requested_start_time
      )) / 60);
      if shift_minutes <= 0 then shift_minutes := shift_minutes + 1440; end if;
      if request_row.requested_lunch_start_time is not null
        and request_row.requested_lunch_end_time is not null then
        lunch_minutes := round(extract(epoch from (
          request_row.requested_lunch_end_time - request_row.requested_lunch_start_time
        )) / 60);
        if lunch_minutes < 0 then lunch_minutes := lunch_minutes + 1440; end if;
      end if;

      insert into public.work_schedules (
        employee_id, branch_id, title, specific_date, work_days,
        expected_start_time, expected_end_time,
        expected_lunch_start_time, expected_lunch_end_time,
        expected_lunch_minutes, expected_daily_minutes,
        crosses_midnight, effective_from, effective_until,
        published_at, published_by, active
      ) values (
        request_row.employee_id,
        request_row.branch_id,
        'Alteração aprovada #' || left(request_row.id::text, 8),
        request_row.request_date,
        coalesce(employee_days, array[1,2,3,4,5]),
        request_row.requested_start_time,
        request_row.requested_end_time,
        request_row.requested_lunch_start_time,
        request_row.requested_lunch_end_time,
        lunch_minutes,
        greatest(0, shift_minutes - lunch_minutes),
        request_row.requested_end_time <= request_row.requested_start_time,
        request_row.request_date,
        request_row.request_date,
        now(),
        reviewer_auth_user_id,
        true
      ) returning id into effect_id;
      request_row.applied_entity_type := 'work_schedule';
    else
      raise exception 'Tipo de solicitação não implementado';
    end if;

    request_row.applied_entity_id := effect_id;
    request_row.applied_at := now();
  end if;

  update public.shift_requests
  set status = p_status,
      admin_observation = p_observation,
      reviewed_by = p_reviewer_id,
      reviewed_at = now(),
      applied_entity_type = request_row.applied_entity_type,
      applied_entity_id = request_row.applied_entity_id,
      applied_at = request_row.applied_at,
      updated_at = now()
  where id = p_request_id
  returning * into request_row;

  return request_row;
end;
$$;

revoke all on function public.review_shift_request_transactional(uuid, text, text, uuid) from public;
grant execute on function public.review_shift_request_transactional(uuid, text, text, uuid) to service_role;
