-- NexPonto — migration de hardening final corrigida
-- Produção em supermercado com matriz e filiais.
--
-- CORREÇÃO PRINCIPAL:
-- A coluna public.time_entries.gps_accuracy_meters é criada antes do índice
-- idx_time_entries_accuracy_date_prod.
--
-- A migration é idempotente e pode ser executada novamente.

-- -----------------------------------------------------------------------------
-- 1. Precheck das dependências principais
-- -----------------------------------------------------------------------------

do $$
begin
  if to_regtype('public.payroll_status') is null then
    raise exception 'O tipo public.payroll_status não existe. Execute primeiro as migrations anteriores.';
  end if;

  if to_regclass('public.payroll_periods') is null then
    raise exception 'A tabela public.payroll_periods não existe.';
  end if;

  if to_regclass('public.branches') is null then
    raise exception 'A tabela public.branches não existe.';
  end if;

  if to_regclass('public.admin_users') is null then
    raise exception 'A tabela public.admin_users não existe.';
  end if;

  if to_regclass('public.time_entries') is null then
    raise exception 'A tabela public.time_entries não existe.';
  end if;

  if to_regclass('public.system_settings') is null then
    raise exception 'A tabela public.system_settings não existe.';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Novos status da pré-folha
-- -----------------------------------------------------------------------------

alter type public.payroll_status add value if not exists 'checking';
alter type public.payroll_status add value if not exists 'ready';
alter type public.payroll_status add value if not exists 'closed_with_exceptions';

-- -----------------------------------------------------------------------------
-- 3. Fechamento e reabertura da pré-folha
-- -----------------------------------------------------------------------------

alter table public.payroll_periods
  add column if not exists closed_at timestamptz,
  add column if not exists reopened_at timestamptz,
  add column if not exists closed_by uuid references auth.users(id) on delete set null,
  add column if not exists closed_with_exceptions boolean not null default false,
  add column if not exists closure_exception_reason text;

-- Garante coerência para registros existentes.
update public.payroll_periods
set closed_with_exceptions = false
where closed_with_exceptions is null;

alter table public.payroll_periods
  alter column closed_with_exceptions set default false,
  alter column closed_with_exceptions set not null;

-- -----------------------------------------------------------------------------
-- 4. Histórico de geolocalização das filiais
-- -----------------------------------------------------------------------------

create table if not exists public.branch_geolocation_history (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  old_latitude numeric(10,7),
  old_longitude numeric(10,7),
  old_radius_meters integer,
  new_latitude numeric(10,7),
  new_longitude numeric(10,7),
  new_radius_meters integer,
  changed_by uuid references auth.users(id) on delete set null,
  reason text,
  created_at timestamptz not null default now(),
  constraint branch_geo_history_old_radius_nonnegative
    check (old_radius_meters is null or old_radius_meters >= 0),
  constraint branch_geo_history_new_radius_nonnegative
    check (new_radius_meters is null or new_radius_meters >= 0)
);

create index if not exists idx_branch_geo_history_branch_date
  on public.branch_geolocation_history(branch_id, created_at desc);

alter table public.branch_geolocation_history enable row level security;

drop policy if exists "admins read branch geo history"
  on public.branch_geolocation_history;

create policy "admins read branch geo history"
  on public.branch_geolocation_history
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "admins insert branch geo history"
  on public.branch_geolocation_history;

create policy "admins insert branch geo history"
  on public.branch_geolocation_history
  for insert
  to authenticated
  with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- 5. Auditoria das exportações de relatórios
-- -----------------------------------------------------------------------------

create table if not exists public.report_export_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references public.admin_users(id) on delete set null,
  user_email text,
  report_type text not null,
  format text not null,
  filters jsonb not null default '{}'::jsonb,
  branch_id uuid references public.branches(id) on delete set null,
  contains_financial_data boolean not null default false,
  row_count integer not null default 0,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now(),
  constraint report_export_logs_row_count_nonnegative check (row_count >= 0)
);

create index if not exists idx_report_export_logs_date_type
  on public.report_export_logs(created_at desc, report_type);

alter table public.report_export_logs enable row level security;

drop policy if exists "admins read report export logs"
  on public.report_export_logs;

create policy "admins read report export logs"
  on public.report_export_logs
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "admins insert report export logs"
  on public.report_export_logs;

create policy "admins insert report export logs"
  on public.report_export_logs
  for insert
  to authenticated
  with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- 6. Campos de sincronização e evidência GPS das marcações
-- -----------------------------------------------------------------------------
-- gps_accuracy_meters é criado aqui mesmo para evitar:
-- ERROR 42703: column "gps_accuracy_meters" does not exist.

alter table public.time_entries
  add column if not exists gps_accuracy_meters integer,
  add column if not exists synced_offline boolean not null default false,
  add column if not exists sync_status text not null default 'online',
  add column if not exists device_fingerprint text;

-- Corrige valores inválidos históricos, se existirem.
update public.time_entries
set gps_accuracy_meters = null
where gps_accuracy_meters is not null
  and gps_accuracy_meters < 0;

update public.time_entries
set sync_status = 'online'
where sync_status is null
   or trim(sync_status) = '';

alter table public.time_entries
  alter column synced_offline set default false,
  alter column synced_offline set not null,
  alter column sync_status set default 'online',
  alter column sync_status set not null;

alter table public.time_entries
  drop constraint if exists time_entries_gps_accuracy_nonnegative,
  add constraint time_entries_gps_accuracy_nonnegative
    check (gps_accuracy_meters is null or gps_accuracy_meters >= 0) not valid;

alter table public.time_entries
  validate constraint time_entries_gps_accuracy_nonnegative;

alter table public.time_entries
  drop constraint if exists time_entries_sync_status_valid,
  add constraint time_entries_sync_status_valid
    check (
      sync_status in (
        'online',
        'saved_on_device',
        'pending',
        'syncing',
        'synced',
        'review',
        'failed'
      )
    ) not valid;

alter table public.time_entries
  validate constraint time_entries_sync_status_valid;

-- -----------------------------------------------------------------------------
-- 7. Índices
-- -----------------------------------------------------------------------------

-- Cria o índice operacional somente se todas as colunas necessárias existirem.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'time_entries'
      and column_name = 'branch_id'
  )
  and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'time_entries'
      and column_name = 'status'
  )
  and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'time_entries'
      and column_name = 'entry_date'
  ) then
    execute '
      create index if not exists idx_time_entries_branch_status_date_prod
      on public.time_entries(branch_id, status, entry_date desc)
    ';
  else
    raise notice 'Índice idx_time_entries_branch_status_date_prod não criado: branch_id, status ou entry_date ausente.';
  end if;
end;
$$;

-- Agora a coluna gps_accuracy_meters já existe.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'time_entries'
      and column_name = 'gps_accuracy_meters'
  )
  and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'time_entries'
      and column_name = 'entry_date'
  ) then
    execute '
      create index if not exists idx_time_entries_accuracy_date_prod
      on public.time_entries(gps_accuracy_meters, entry_date desc)
    ';
  else
    raise notice 'Índice idx_time_entries_accuracy_date_prod não criado: coluna necessária ausente.';
  end if;
end;
$$;

-- Índice útil para sincronizações offline.
create index if not exists idx_time_entries_sync_status_date
  on public.time_entries(sync_status, entry_date desc);

-- -----------------------------------------------------------------------------
-- 8. Configurações de produção
-- -----------------------------------------------------------------------------

insert into public.system_settings (key, value)
values
  ('offline_point_mode', '"block"'::jsonb),
  ('large_pdf_warning_limit', '300'::jsonb),
  ('large_excel_warning_limit', '1500'::jsonb),
  ('public_search_rate_limit_per_minute', '40'::jsonb)
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- 9. Postcheck
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'time_entries'
      and column_name = 'gps_accuracy_meters'
  ) then
    raise exception 'Falha: public.time_entries.gps_accuracy_meters não foi criada.';
  end if;

  if to_regclass('public.branch_geolocation_history') is null then
    raise exception 'Falha: public.branch_geolocation_history não foi criada.';
  end if;

  if to_regclass('public.report_export_logs') is null then
    raise exception 'Falha: public.report_export_logs não foi criada.';
  end if;
end;
$$;
