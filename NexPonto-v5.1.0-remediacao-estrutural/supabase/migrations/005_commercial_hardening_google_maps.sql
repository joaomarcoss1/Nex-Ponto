-- NexPonto — migration 005 corrigida
-- Rodada comercial estrutural: geolocalização editável por mapa, permissões por filial,
-- precisão GPS, fechamento seguro da folha e relatório executivo.
--
-- CORREÇÃO PRINCIPAL:
-- Os valores novos do enum admin_role são adicionados nesta mesma execução, mas não são
-- comparados como valores tipados do enum antes do COMMIT. As comparações usam role::text,
-- evitando o erro PostgreSQL 55P04: unsafe use of new value of enum type.
--
-- O arquivo é idempotente e pode ser executado novamente caso a execução anterior tenha
-- sido revertida pelo Supabase SQL Editor.

-- -----------------------------------------------------------------------------
-- 1. Validações mínimas da ordem das migrations
-- -----------------------------------------------------------------------------

do $$
begin
  if to_regtype('public.admin_role') is null then
    raise exception 'O tipo public.admin_role não existe. Execute primeiro as migrations anteriores à 005.';
  end if;

  if to_regclass('public.admin_users') is null
     or to_regclass('public.branches') is null
     or to_regclass('public.employees') is null
     or to_regclass('public.time_entries') is null
     or to_regclass('public.payroll_periods') is null
     or to_regclass('public.payroll_items') is null
     or to_regclass('public.system_settings') is null then
    raise exception 'Uma ou mais tabelas-base não existem. Confirme que as migrations 001 a 004 foram aplicadas.';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Novos papéis
-- -----------------------------------------------------------------------------
-- IMPORTANTE: os novos valores só são referenciados posteriormente como TEXTO.

alter type public.admin_role add value if not exists 'admin_geral';
alter type public.admin_role add value if not exists 'gerente_filial';

-- -----------------------------------------------------------------------------
-- 3. Escopo administrativo por filial
-- -----------------------------------------------------------------------------

alter table public.admin_users
  add column if not exists branch_id uuid references public.branches(id) on delete set null,
  add column if not exists allowed_branch_ids uuid[] not null default '{}'::uuid[],
  add column if not exists can_view_financial_data boolean not null default false;

create index if not exists idx_admin_users_branch_scope
  on public.admin_users(branch_id);

-- -----------------------------------------------------------------------------
-- 4. Geolocalização das filiais
-- -----------------------------------------------------------------------------

alter table public.branches
  add column if not exists google_maps_url text,
  add column if not exists map_place_id text,
  add column if not exists geofence_enabled boolean not null default true,
  add column if not exists geolocation_configured_at timestamptz,
  add column if not exists geolocation_configured_by uuid references auth.users(id) on delete set null;

-- -----------------------------------------------------------------------------
-- 5. Matrícula/código de registro do funcionário
-- -----------------------------------------------------------------------------

alter table public.employees
  add column if not exists registration_code text;

-- Interrompe com mensagem clara se já existirem códigos duplicados não vazios.
do $$
declare
  duplicate_codes text;
begin
  select string_agg(registration_code, ', ' order by registration_code)
    into duplicate_codes
  from (
    select trim(registration_code) as registration_code
    from public.employees
    where nullif(trim(registration_code), '') is not null
    group by trim(registration_code)
    having count(*) > 1
    limit 20
  ) duplicates;

  if duplicate_codes is not null then
    raise exception
      'Não foi possível criar o índice único de matrícula. Existem registration_code duplicados: %. Corrija os códigos e execute novamente.',
      duplicate_codes;
  end if;
end;
$$;

create unique index if not exists idx_employees_registration_code_unique
  on public.employees(registration_code)
  where registration_code is not null and trim(registration_code) <> '';

-- -----------------------------------------------------------------------------
-- 6. Evidências da validação GPS no ponto
-- -----------------------------------------------------------------------------

alter table public.time_entries
  add column if not exists gps_accuracy_meters integer,
  add column if not exists validation_branch_id uuid references public.branches(id) on delete set null,
  add column if not exists validation_branch_latitude numeric(10,7),
  add column if not exists validation_branch_longitude numeric(10,7),
  add column if not exists validation_radius_meters integer,
  add column if not exists validation_notes text,
  add column if not exists ip_address text;

create index if not exists idx_time_entries_gps_accuracy
  on public.time_entries(gps_accuracy_meters);

create index if not exists idx_time_entries_validation_branch
  on public.time_entries(validation_branch_id, entry_date);

-- -----------------------------------------------------------------------------
-- 7. Fechamento seguro da pré-folha
-- -----------------------------------------------------------------------------

alter table public.payroll_periods
  add column if not exists closure_checklist jsonb not null default '[]'::jsonb,
  add column if not exists closure_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists closure_override_reason text,
  add column if not exists reopened_reason text;

-- Garante valores válidos caso as colunas já existissem sem default ou com NULL.
update public.payroll_periods
set closure_checklist = coalesce(closure_checklist, '[]'::jsonb),
    closure_snapshot = coalesce(closure_snapshot, '{}'::jsonb)
where closure_checklist is null
   or closure_snapshot is null;

alter table public.payroll_periods
  alter column closure_checklist set default '[]'::jsonb,
  alter column closure_checklist set not null,
  alter column closure_snapshot set default '{}'::jsonb,
  alter column closure_snapshot set not null;

create table if not exists public.payroll_closure_checks (
  id uuid primary key default gen_random_uuid(),
  payroll_period_id uuid not null references public.payroll_periods(id) on delete cascade,
  check_type text not null,
  severity text not null check (severity in ('critical', 'warning', 'info')),
  label text not null,
  count integer not null default 0 check (count >= 0),
  details jsonb not null default '[]'::jsonb,
  ignored boolean not null default false,
  ignore_reason text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint payroll_closure_checks_ignore_reason_check
    check (not ignored or nullif(trim(ignore_reason), '') is not null)
);

create index if not exists idx_payroll_closure_checks_period
  on public.payroll_closure_checks(payroll_period_id, severity, ignored);

alter table public.payroll_closure_checks enable row level security;

-- Policy provisória compatível com a fase inicial do schema.
-- As migrations posteriores do NexPonto substituem esta policy por isolamento de tenant/filial.
drop policy if exists "admins manage payroll closure checks"
  on public.payroll_closure_checks;

create policy "admins manage payroll closure checks"
  on public.payroll_closure_checks
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- 8. Configurações iniciais
-- -----------------------------------------------------------------------------

insert into public.system_settings (key, value)
values
  ('max_gps_accuracy_meters', '100'::jsonb),
  ('require_review_on_poor_gps_accuracy', 'true'::jsonb),
  ('allow_different_branch_with_authorization', 'true'::jsonb),
  ('default_radius_meters', '900'::jsonb),
  ('google_maps_enabled', 'true'::jsonb)
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- 9. Função auxiliar de escopo por filial
-- -----------------------------------------------------------------------------
-- CORREÇÃO 55P04: role é convertido para TEXT antes da comparação.

create or replace function public.current_admin_branch_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(
    (
      select case
        when au.role::text in ('master_admin', 'admin_geral', 'rh_financeiro')
             and cardinality(coalesce(au.allowed_branch_ids, '{}'::uuid[])) = 0
          then '{}'::uuid[]
        when cardinality(coalesce(au.allowed_branch_ids, '{}'::uuid[])) > 0
          then au.allowed_branch_ids
        when au.branch_id is not null
          then array[au.branch_id]::uuid[]
        else '{}'::uuid[]
      end
      from public.admin_users au
      where au.active = true
        and (
          au.auth_user_id = auth.uid()
          or lower(au.email) = lower(coalesce(auth.email(), ''))
        )
      order by au.created_at asc
      limit 1
    ),
    '{}'::uuid[]
  );
$$;

revoke all on function public.current_admin_branch_ids() from public;
grant execute on function public.current_admin_branch_ids() to authenticated;

-- -----------------------------------------------------------------------------
-- 10. Campos complementares dos itens da pré-folha
-- -----------------------------------------------------------------------------

alter table public.payroll_items
  add column if not exists daily_rate_base_days integer not null default 0,
  add column if not exists business_days integer not null default 0;

-- Valores históricos negativos não são aceitos nos novos campos.
update public.payroll_items
set daily_rate_base_days = greatest(coalesce(daily_rate_base_days, 0), 0),
    business_days = greatest(coalesce(business_days, 0), 0)
where daily_rate_base_days is null
   or business_days is null
   or daily_rate_base_days < 0
   or business_days < 0;

alter table public.payroll_items
  drop constraint if exists payroll_items_daily_rate_base_days_nonnegative,
  add constraint payroll_items_daily_rate_base_days_nonnegative
    check (daily_rate_base_days >= 0) not valid,
  drop constraint if exists payroll_items_business_days_nonnegative,
  add constraint payroll_items_business_days_nonnegative
    check (business_days >= 0) not valid;

alter table public.payroll_items
  validate constraint payroll_items_daily_rate_base_days_nonnegative;

alter table public.payroll_items
  validate constraint payroll_items_business_days_nonnegative;

-- -----------------------------------------------------------------------------
-- 11. Pós-validação da migration
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'admin_role'
      and e.enumlabel = 'admin_geral'
  ) then
    raise exception 'Falha ao adicionar admin_geral ao enum public.admin_role.';
  end if;

  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'admin_role'
      and e.enumlabel = 'gerente_filial'
  ) then
    raise exception 'Falha ao adicionar gerente_filial ao enum public.admin_role.';
  end if;

  if to_regclass('public.payroll_closure_checks') is null then
    raise exception 'A tabela public.payroll_closure_checks não foi criada.';
  end if;
end;
$$;