-- Hardening final para produção em supermercado com matriz e filiais.
-- Migration idempotente: reforça auditoria, snapshot, geolocalização e status de folha.

alter type public.payroll_status add value if not exists 'checking';
alter type public.payroll_status add value if not exists 'ready';
alter type public.payroll_status add value if not exists 'closed_with_exceptions';

alter table public.payroll_periods
  add column if not exists closed_at timestamptz,
  add column if not exists reopened_at timestamptz,
  add column if not exists closed_by uuid references auth.users(id) on delete set null,
  add column if not exists closed_with_exceptions boolean not null default false,
  add column if not exists closure_exception_reason text;

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
  created_at timestamptz not null default now()
);

create index if not exists idx_branch_geo_history_branch_date on public.branch_geolocation_history(branch_id, created_at desc);
alter table public.branch_geolocation_history enable row level security;
drop policy if exists "admins read branch geo history" on public.branch_geolocation_history;
create policy "admins read branch geo history" on public.branch_geolocation_history
for select to authenticated using (public.is_admin());

drop policy if exists "admins insert branch geo history" on public.branch_geolocation_history;
create policy "admins insert branch geo history" on public.branch_geolocation_history
for insert to authenticated with check (public.is_admin());

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
  created_at timestamptz not null default now()
);

create index if not exists idx_report_export_logs_date_type on public.report_export_logs(created_at desc, report_type);
alter table public.report_export_logs enable row level security;
drop policy if exists "admins read report export logs" on public.report_export_logs;
create policy "admins read report export logs" on public.report_export_logs
for select to authenticated using (public.is_admin());

drop policy if exists "admins insert report export logs" on public.report_export_logs;
create policy "admins insert report export logs" on public.report_export_logs
for insert to authenticated with check (public.is_admin());

alter table public.time_entries
  add column if not exists synced_offline boolean not null default false,
  add column if not exists sync_status text not null default 'online',
  add column if not exists device_fingerprint text;

create index if not exists idx_time_entries_branch_status_date_prod on public.time_entries(branch_id, status, entry_date desc);
create index if not exists idx_time_entries_accuracy_date_prod on public.time_entries(gps_accuracy_meters, entry_date desc);

insert into public.system_settings (key, value) values
  ('offline_point_mode', '"block"'::jsonb),
  ('large_pdf_warning_limit', '300'::jsonb),
  ('large_excel_warning_limit', '1500'::jsonb),
  ('public_search_rate_limit_per_minute', '40'::jsonb)
on conflict (key) do nothing;
