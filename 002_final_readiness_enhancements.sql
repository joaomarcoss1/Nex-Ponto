create table if not exists public.pin_attempt_logs (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees(id) on delete set null,
  attempted_name text,
  ip_address text,
  device_info text,
  success boolean not null default false,
  reason text,
  created_at timestamptz not null default now()
);

alter table public.work_schedules
  add column if not exists branch_id uuid references public.branches(id) on delete set null,
  add column if not exists weekday integer,
  add column if not exists specific_date date,
  add column if not exists priority integer not null default 10,
  add column if not exists notes text;

alter table public.work_schedules
  drop constraint if exists work_schedules_weekday_valid;

alter table public.work_schedules
  add constraint work_schedules_weekday_valid check (weekday is null or weekday between 0 and 6);

alter table public.time_entries
  add column if not exists expected_start_time time,
  add column if not exists expected_end_time time,
  add column if not exists expected_daily_minutes integer,
  add column if not exists expected_lunch_minutes integer,
  add column if not exists occurrence_review_status text not null default 'pending_review',
  add column if not exists occurrence_review_observation text,
  add column if not exists occurrence_reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists occurrence_reviewed_at timestamptz,
  add column if not exists original_entry_id uuid references public.time_entries(id) on delete set null;

alter table public.time_entries
  drop constraint if exists time_entries_occurrence_status_valid;

alter table public.time_entries
  add constraint time_entries_occurrence_status_valid
  check (occurrence_review_status in ('pending_review', 'approved', 'rejected', 'adjusted', 'cancelled'));

update public.time_entries
set occurrence_review_status = case
  when status = 'adjusted' then 'adjusted'
  when status = 'canceled' then 'cancelled'
  when status = 'blocked' then 'rejected'
  when required_justification = true then 'pending_review'
  else 'approved'
end
where occurrence_review_status = 'pending_review'
  and required_justification = false;

alter table public.overtime_reviews
  add column if not exists worked_minutes integer not null default 0,
  add column if not exists expected_minutes integer not null default 0,
  add column if not exists calculated_overtime_minutes integer not null default 0,
  add column if not exists approved_overtime_minutes integer not null default 0,
  add column if not exists overtime_amount numeric(12,2) not null default 0,
  add column if not exists reviewed_observation text;

alter table public.employee_salary_history
  add column if not exists valid_from date,
  add column if not exists valid_until date,
  add column if not exists reason text;

update public.employee_salary_history
set valid_from = coalesce(valid_from, effective_from)
where valid_from is null;

alter table public.payroll_items
  add column if not exists pending_absences integer not null default 0,
  add column if not exists rejected_absences integer not null default 0,
  add column if not exists identified_absences integer not null default 0,
  add column if not exists calculated_overtime_minutes integer not null default 0,
  add column if not exists approved_overtime_minutes integer not null default 0,
  add column if not exists bank_account_type text,
  add column if not exists period_status_snapshot text not null default 'draft';

create index if not exists idx_work_schedules_lookup
  on public.work_schedules(employee_id, branch_id, specific_date, weekday, effective_from, effective_until, active);

create index if not exists idx_pin_attempt_logs_employee_created
  on public.pin_attempt_logs(employee_id, created_at desc);

create index if not exists idx_time_entries_occurrence_status
  on public.time_entries(occurrence_review_status);

alter table public.pin_attempt_logs enable row level security;

drop policy if exists "admins read pin attempt logs" on public.pin_attempt_logs;
create policy "admins read pin attempt logs" on public.pin_attempt_logs
for select to authenticated using (public.is_admin());

insert into public.system_settings (key, value) values
  ('allow_outside_radius_review', 'false'::jsonb),
  ('auto_approve_overtime', 'false'::jsonb),
  ('primary_color', '"#078d3a"'::jsonb),
  ('secondary_color', '"#ffc107"'::jsonb)
on conflict (key) do nothing;
