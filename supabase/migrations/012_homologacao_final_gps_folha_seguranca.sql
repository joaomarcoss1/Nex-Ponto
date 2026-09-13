-- Homologação final GPS, folha, relatórios e segurança - 2026-07-10
-- Execute após a migration 011.

create extension if not exists pg_trgm;

alter table public.branches
  add column if not exists geolocation_confirmed_at timestamptz,
  add column if not exists geolocation_confirmed_by uuid references auth.users(id) on delete set null,
  add column if not exists geolocation_status text not null default 'pending',
  add column if not exists gps_ready boolean not null default false,
  add column if not exists last_gps_test_at timestamptz;

alter table public.branches
  drop constraint if exists branches_geolocation_status_check;
alter table public.branches
  add constraint branches_geolocation_status_check
  check (geolocation_status in ('pending','confirmed','needs_review'));

update public.branches
set geolocation_status = case
    when latitude is not null and longitude is not null and coalesce(geofence_enabled,true) = true then coalesce(nullif(geolocation_status,''),'confirmed')
    else 'pending'
  end,
  gps_ready = case
    when latitude is not null and longitude is not null and coalesce(geofence_enabled,true) = true and coalesce(allowed_radius_meters,0) > 0 then true
    else false
  end,
  geolocation_confirmed_at = coalesce(geolocation_confirmed_at, geolocation_configured_at, now())
where active = true;

alter table public.time_entries
  add column if not exists idempotency_key text,
  add column if not exists gps_diagnostic_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists lunch_variation_minutes integer not null default 0,
  add column if not exists schedule_compliance_status text not null default 'not_evaluated';

alter table public.time_entries
  drop constraint if exists time_entries_schedule_compliance_status_check;
alter table public.time_entries
  add constraint time_entries_schedule_compliance_status_check
  check (schedule_compliance_status in ('not_evaluated','ok','late','early_leave','lunch_early','lunch_late','lunch_long','journey_incomplete','blocked'));

-- Protege contra duplo clique, duas abas, internet oscilando ou requisição concorrente.
create unique index if not exists idx_unique_time_entry_action_per_day
on public.time_entries(employee_id, entry_date, action)
where status in ('valid', 'pending_review', 'adjusted');

create unique index if not exists idx_time_entries_idempotency_key
on public.time_entries(idempotency_key)
where idempotency_key is not null;

create index if not exists idx_employees_branch_active on public.employees(branch_id, active);
create index if not exists idx_employees_registration_code on public.employees(registration_code);
create index if not exists idx_employees_document on public.employees(document);
create index if not exists employees_full_name_trgm_idx on public.employees using gin (full_name gin_trgm_ops);
create index if not exists idx_time_entries_employee_date_v012 on public.time_entries(employee_id, entry_date);
create index if not exists idx_time_entries_branch_date_v012 on public.time_entries(branch_id, entry_date);
create index if not exists idx_time_entries_date_action on public.time_entries(entry_date, action);
create index if not exists idx_time_entries_review_flags_gin on public.time_entries using gin (review_flags);
create index if not exists idx_absence_justifications_status_branch on public.absence_justifications(status, branch_id);
create index if not exists idx_overtime_reviews_status_branch on public.overtime_reviews(status, branch_id);
create index if not exists idx_payroll_periods_branch_dates on public.payroll_periods(branch_id, start_date, end_date);
create index if not exists idx_payroll_items_period_employee on public.payroll_items(payroll_period_id, employee_id);
create index if not exists idx_audit_logs_created_action on public.audit_logs(created_at desc, action);

create table if not exists public.payroll_homologation_checks (
  id uuid primary key default gen_random_uuid(),
  payroll_period_id uuid references public.payroll_periods(id) on delete cascade,
  check_type text not null,
  severity text not null check (severity in ('critical','warning','info')),
  label text not null,
  employee_id uuid references public.employees(id) on delete set null,
  branch_id uuid references public.branches(id) on delete set null,
  action_hint text,
  status text not null default 'open' check (status in ('open','resolved','ignored')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_payroll_homologation_period on public.payroll_homologation_checks(payroll_period_id, severity, status);
alter table public.payroll_homologation_checks enable row level security;
drop policy if exists "admins read payroll homologation checks" on public.payroll_homologation_checks;
create policy "admins read payroll homologation checks" on public.payroll_homologation_checks for select to authenticated using (public.is_admin());
drop policy if exists "admins write payroll homologation checks" on public.payroll_homologation_checks;
create policy "admins write payroll homologation checks" on public.payroll_homologation_checks for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into public.system_settings (key, value) values
  ('block_clock_without_confirmed_branch_gps', 'true'::jsonb),
  ('block_poor_gps_accuracy', 'false'::jsonb),
  ('max_gps_accuracy_meters', '120'::jsonb),
  ('payroll_block_critical_pending', 'true'::jsonb),
  ('payroll_pdf_max_detailed_rows', '300'::jsonb),
  ('payroll_pdf_block_rows', '1500'::jsonb)
on conflict (key) do update set value = excluded.value, updated_at = now();
