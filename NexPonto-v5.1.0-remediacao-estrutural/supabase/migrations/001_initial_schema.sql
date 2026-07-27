create extension if not exists "pgcrypto";

do $$ begin
  create type admin_role as enum ('master_admin', 'admin', 'rh_financeiro');
exception when duplicate_object then null; end $$;

do $$ begin
  create type branch_type as enum ('matriz', 'filial');
exception when duplicate_object then null; end $$;

do $$ begin
  create type employment_type as enum ('mensalista', 'quinzenal', 'diarista');
exception when duplicate_object then null; end $$;

do $$ begin
  create type daily_rate_mode as enum ('automatic', 'manual');
exception when duplicate_object then null; end $$;

do $$ begin
  create type time_action as enum ('start_shift', 'start_lunch', 'end_lunch', 'end_shift');
exception when duplicate_object then null; end $$;

do $$ begin
  create type time_entry_status as enum ('valid', 'pending_review', 'adjusted', 'blocked', 'canceled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type justification_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payroll_period_type as enum ('monthly', 'biweekly', 'daily', 'custom');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payroll_status as enum ('draft', 'reviewed', 'closed', 'paid', 'reopened');
exception when duplicate_object then null; end $$;

do $$ begin
  create type holiday_type as enum ('holiday', 'day_off', 'no_work');
exception when duplicate_object then null; end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete set null,
  email text not null unique,
  full_name text not null,
  role admin_role not null default 'admin',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type branch_type not null default 'filial',
  address text not null,
  latitude numeric(10,7) not null,
  longitude numeric(10,7) not null,
  allowed_radius_meters integer not null default 900 check (allowed_radius_meters > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  document text,
  phone text,
  role text not null,
  branch_id uuid not null references public.branches(id),
  employment_type employment_type not null default 'mensalista',
  monthly_salary numeric(12,2) not null default 0,
  daily_rate numeric(12,2),
  daily_rate_mode daily_rate_mode not null default 'automatic',
  pix_key text,
  bank_name text,
  bank_agency text,
  bank_account text,
  bank_account_type text,
  pin_hash text not null,
  active boolean not null default true,
  admission_date date not null default current_date,
  expected_start_time time not null default '08:00',
  expected_end_time time not null default '17:00',
  expected_daily_minutes integer not null default 480 check (expected_daily_minutes > 0),
  expected_lunch_minutes integer not null default 60 check (expected_lunch_minutes >= 0),
  work_days integer[] not null default array[1,2,3,4,5,6],
  allow_overtime boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employees_work_days_valid check (work_days <@ array[0,1,2,3,4,5,6])
);

create table if not exists public.employee_salary_history (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  monthly_salary numeric(12,2) not null,
  daily_rate numeric(12,2),
  daily_rate_mode daily_rate_mode not null,
  effective_from date not null default current_date,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.work_schedules (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  title text not null default 'Escala principal',
  work_days integer[] not null default array[1,2,3,4,5,6],
  expected_start_time time not null,
  expected_end_time time not null,
  expected_daily_minutes integer not null,
  expected_lunch_minutes integer not null default 60,
  effective_from date not null default current_date,
  effective_until date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_schedules_days_valid check (work_days <@ array[0,1,2,3,4,5,6])
);

create table if not exists public.employee_branch_authorizations (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  reason text not null,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint branch_authorization_period check (ends_on >= starts_on)
);

create table if not exists public.holidays (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches(id) on delete cascade,
  holiday_date date not null,
  title text not null,
  type holiday_type not null default 'holiday',
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  branch_id uuid not null references public.branches(id),
  action time_action not null,
  entry_timestamp timestamptz not null default now(),
  entry_date date not null default current_date,
  latitude numeric(10,7),
  longitude numeric(10,7),
  distance_meters integer,
  inside_allowed_radius boolean not null default false,
  late_minutes integer not null default 0 check (late_minutes >= 0),
  early_leave_minutes integer not null default 0 check (early_leave_minutes >= 0),
  required_justification boolean not null default false,
  justification_text text,
  device_info text,
  status time_entry_status not null default 'valid',
  review_flags text[] not null default '{}',
  adjusted_by uuid references auth.users(id) on delete set null,
  adjusted_at timestamptz,
  adjustment_reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.absence_justifications (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  branch_id uuid not null references public.branches(id),
  absence_date date not null,
  justification_text text not null,
  attachment_url text,
  attachment_path text,
  status justification_status not null default 'pending',
  admin_observation text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.payroll_periods (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  period_type payroll_period_type not null default 'monthly',
  start_date date not null,
  end_date date not null,
  branch_id uuid references public.branches(id),
  status payroll_status not null default 'draft',
  created_by uuid references auth.users(id) on delete set null,
  closed_at timestamptz,
  reopened_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_period_valid check (end_date >= start_date)
);

create table if not exists public.payroll_items (
  id uuid primary key default gen_random_uuid(),
  payroll_period_id uuid not null references public.payroll_periods(id) on delete cascade,
  employee_id uuid not null references public.employees(id),
  branch_id uuid not null references public.branches(id),
  employee_name text not null,
  branch_name text not null,
  role text not null,
  employment_type employment_type not null,
  base_salary numeric(12,2) not null default 0,
  daily_rate numeric(12,2) not null default 0,
  expected_work_days integer not null default 0,
  worked_days integer not null default 0,
  approved_absences integer not null default 0,
  discounted_absences integer not null default 0,
  total_late_minutes integer not null default 0,
  total_early_leave_minutes integer not null default 0,
  overtime_minutes integer not null default 0,
  extra_days integer not null default 0,
  absence_discount_amount numeric(12,2) not null default 0,
  overtime_amount numeric(12,2) not null default 0,
  extra_day_amount numeric(12,2) not null default 0,
  final_amount numeric(12,2) not null default 0,
  pix_key text,
  bank_name text,
  bank_agency text,
  bank_account text,
  notes text,
  calculation_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (payroll_period_id, employee_id)
);

create table if not exists public.overtime_reviews (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  branch_id uuid not null references public.branches(id),
  entry_date date not null,
  overtime_minutes integer not null default 0,
  status justification_status not null default 'pending',
  admin_observation text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  user_email text,
  action text not null,
  entity text not null,
  entity_id text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.system_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create or replace trigger admin_users_updated_at before update on public.admin_users
for each row execute function public.set_updated_at();

create or replace trigger branches_updated_at before update on public.branches
for each row execute function public.set_updated_at();

create or replace trigger employees_updated_at before update on public.employees
for each row execute function public.set_updated_at();

create or replace trigger work_schedules_updated_at before update on public.work_schedules
for each row execute function public.set_updated_at();

create or replace trigger employee_branch_authorizations_updated_at before update on public.employee_branch_authorizations
for each row execute function public.set_updated_at();

create or replace trigger holidays_updated_at before update on public.holidays
for each row execute function public.set_updated_at();

create or replace trigger payroll_periods_updated_at before update on public.payroll_periods
for each row execute function public.set_updated_at();

create index if not exists idx_employees_branch on public.employees(branch_id);
create index if not exists idx_employees_active on public.employees(active);
create index if not exists idx_time_entries_employee_date on public.time_entries(employee_id, entry_date);
create index if not exists idx_time_entries_branch_date on public.time_entries(branch_id, entry_date);
create index if not exists idx_time_entries_status on public.time_entries(status);
create index if not exists idx_absence_justifications_status on public.absence_justifications(status);
create index if not exists idx_payroll_periods_dates on public.payroll_periods(start_date, end_date, status);
create index if not exists idx_audit_logs_created_at on public.audit_logs(created_at desc);

alter table public.admin_users enable row level security;
alter table public.branches enable row level security;
alter table public.employees enable row level security;
alter table public.employee_salary_history enable row level security;
alter table public.work_schedules enable row level security;
alter table public.employee_branch_authorizations enable row level security;
alter table public.holidays enable row level security;
alter table public.time_entries enable row level security;
alter table public.absence_justifications enable row level security;
alter table public.payroll_periods enable row level security;
alter table public.payroll_items enable row level security;
alter table public.overtime_reviews enable row level security;
alter table public.audit_logs enable row level security;
alter table public.system_settings enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.admin_users
    where active = true
      and (auth_user_id = auth.uid() or email = auth.email())
  );
$$;

create or replace function public.is_master_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.admin_users
    where active = true
      and role = 'master_admin'
      and (auth_user_id = auth.uid() or email = auth.email())
  );
$$;

drop policy if exists "admins can read admin users" on public.admin_users;
create policy "admins can read admin users" on public.admin_users
for select to authenticated using (public.is_admin());

drop policy if exists "master admins manage admin users" on public.admin_users;
create policy "master admins manage admin users" on public.admin_users
for all to authenticated using (public.is_master_admin()) with check (public.is_master_admin());

drop policy if exists "admins read branches" on public.branches;
create policy "admins read branches" on public.branches
for select to authenticated using (public.is_admin());

drop policy if exists "admins manage branches" on public.branches;
create policy "admins manage branches" on public.branches
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins manage employees" on public.employees;
create policy "admins manage employees" on public.employees
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins manage salary history" on public.employee_salary_history;
create policy "admins manage salary history" on public.employee_salary_history
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins manage work schedules" on public.work_schedules;
create policy "admins manage work schedules" on public.work_schedules
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins manage branch authorizations" on public.employee_branch_authorizations;
create policy "admins manage branch authorizations" on public.employee_branch_authorizations
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins manage holidays" on public.holidays;
create policy "admins manage holidays" on public.holidays
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins manage time entries" on public.time_entries;
create policy "admins manage time entries" on public.time_entries
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins manage absence justifications" on public.absence_justifications;
create policy "admins manage absence justifications" on public.absence_justifications
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins manage payroll periods" on public.payroll_periods;
create policy "admins manage payroll periods" on public.payroll_periods
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins manage payroll items" on public.payroll_items;
create policy "admins manage payroll items" on public.payroll_items
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins manage overtime reviews" on public.overtime_reviews;
create policy "admins manage overtime reviews" on public.overtime_reviews
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins read audit logs" on public.audit_logs;
create policy "admins read audit logs" on public.audit_logs
for select to authenticated using (public.is_admin());

drop policy if exists "admins manage settings" on public.system_settings;
create policy "admins manage settings" on public.system_settings
for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'justificativas',
  'justificativas',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "admins read justification files" on storage.objects;
create policy "admins read justification files" on storage.objects
for select to authenticated
using (bucket_id = 'justificativas' and public.is_admin());

drop policy if exists "admins manage justification files" on storage.objects;
create policy "admins manage justification files" on storage.objects
for all to authenticated
using (bucket_id = 'justificativas' and public.is_admin())
with check (bucket_id = 'justificativas' and public.is_admin());
