-- Rodada comercial estrutural: geolocalização editável por mapa, permissões por filial,
-- precisão GPS, fechamento seguro da folha e relatório executivo.

-- Novos papéis sem quebrar usuários existentes.
alter type public.admin_role add value if not exists 'admin_geral';
alter type public.admin_role add value if not exists 'gerente_filial';

alter table public.admin_users
  add column if not exists branch_id uuid references public.branches(id) on delete set null,
  add column if not exists allowed_branch_ids uuid[] not null default '{}',
  add column if not exists can_view_financial_data boolean not null default false;

create index if not exists idx_admin_users_branch_scope on public.admin_users(branch_id);

alter table public.branches
  add column if not exists google_maps_url text,
  add column if not exists map_place_id text,
  add column if not exists geofence_enabled boolean not null default true,
  add column if not exists geolocation_configured_at timestamptz,
  add column if not exists geolocation_configured_by uuid references auth.users(id) on delete set null;

alter table public.employees
  add column if not exists registration_code text;

create unique index if not exists idx_employees_registration_code_unique
  on public.employees(registration_code)
  where registration_code is not null and registration_code <> '';

alter table public.time_entries
  add column if not exists gps_accuracy_meters integer,
  add column if not exists validation_branch_id uuid references public.branches(id) on delete set null,
  add column if not exists validation_branch_latitude numeric(10,7),
  add column if not exists validation_branch_longitude numeric(10,7),
  add column if not exists validation_radius_meters integer,
  add column if not exists validation_notes text,
  add column if not exists ip_address text;

create index if not exists idx_time_entries_gps_accuracy on public.time_entries(gps_accuracy_meters);
create index if not exists idx_time_entries_validation_branch on public.time_entries(validation_branch_id, entry_date);

alter table public.payroll_periods
  add column if not exists closure_checklist jsonb not null default '[]'::jsonb,
  add column if not exists closure_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists closure_override_reason text,
  add column if not exists reopened_reason text;

create table if not exists public.payroll_closure_checks (
  id uuid primary key default gen_random_uuid(),
  payroll_period_id uuid not null references public.payroll_periods(id) on delete cascade,
  check_type text not null,
  severity text not null check (severity in ('critical', 'warning', 'info')),
  label text not null,
  count integer not null default 0,
  details jsonb not null default '[]'::jsonb,
  ignored boolean not null default false,
  ignore_reason text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_payroll_closure_checks_period on public.payroll_closure_checks(payroll_period_id, severity, ignored);
alter table public.payroll_closure_checks enable row level security;

drop policy if exists "admins manage payroll closure checks" on public.payroll_closure_checks;
create policy "admins manage payroll closure checks" on public.payroll_closure_checks
for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into public.system_settings (key, value) values
  ('max_gps_accuracy_meters', '100'::jsonb),
  ('require_review_on_poor_gps_accuracy', 'true'::jsonb),
  ('allow_different_branch_with_authorization', 'true'::jsonb),
  ('default_radius_meters', '900'::jsonb),
  ('google_maps_enabled', 'true'::jsonb)
on conflict (key) do nothing;

-- Funções auxiliares para RLS futura por filial, mantendo compatibilidade com service role.
create or replace function public.current_admin_branch_ids()
returns uuid[]
language sql
stable
as $$
  select coalesce(
    case
      when au.role in ('master_admin', 'admin_geral', 'rh_financeiro') and cardinality(coalesce(au.allowed_branch_ids, '{}')) = 0 then null
      when cardinality(coalesce(au.allowed_branch_ids, '{}')) > 0 then au.allowed_branch_ids
      when au.branch_id is not null then array[au.branch_id]
      else '{}'
    end,
    '{}'
  )
  from public.admin_users au
  where au.active = true and (au.auth_user_id = auth.uid() or au.email = auth.email())
  limit 1;
$$;

alter table public.payroll_items
  add column if not exists daily_rate_base_days integer not null default 0,
  add column if not exists business_days integer not null default 0;
