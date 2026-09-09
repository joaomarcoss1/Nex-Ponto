-- v014 Segurança, Relatórios e Folha Premium
-- Blindagem incremental para permissões, GPS, jornada de almoço, filtros de folha e performance.

create extension if not exists pg_trgm;

alter table public.employees
  add column if not exists payment_day integer,
  add column if not exists expected_lunch_start_time time,
  add column if not exists expected_lunch_end_time time,
  add column if not exists schedule_confirmed boolean default true;

alter table public.employees
  drop constraint if exists employees_payment_day_range;

alter table public.employees
  add constraint employees_payment_day_range
  check (payment_day is null or (payment_day between 1 and 31));

alter table public.work_schedules
  add column if not exists expected_lunch_start_time time,
  add column if not exists expected_lunch_end_time time;

alter table public.branches
  add column if not exists geolocation_confirmed_at timestamptz,
  add column if not exists geolocation_confirmed_by uuid,
  add column if not exists geolocation_status text default 'pending',
  add column if not exists gps_ready boolean default false,
  add column if not exists last_gps_test_at timestamptz;

alter table public.time_entries
  add column if not exists idempotency_key text,
  add column if not exists gps_diagnostic_snapshot jsonb default '{}'::jsonb,
  add column if not exists lunch_variation_minutes integer default 0,
  add column if not exists schedule_compliance_status text default 'not_evaluated',
  add column if not exists expected_lunch_start_time time,
  add column if not exists expected_lunch_end_time time;

alter table public.payroll_periods
  add column if not exists payment_day integer,
  add column if not exists closure_override_reason text,
  add column if not exists reopened_reason text,
  add column if not exists closure_snapshot jsonb,
  add column if not exists closure_checklist jsonb;

alter table public.payroll_periods
  drop constraint if exists payroll_periods_payment_day_range;

alter table public.payroll_periods
  add constraint payroll_periods_payment_day_range
  check (payment_day is null or (payment_day between 1 and 31));

create unique index if not exists idx_unique_time_entry_action_per_day
  on public.time_entries(employee_id, entry_date, action)
  where status in ('valid', 'pending_review', 'adjusted');

create unique index if not exists idx_time_entries_idempotency_key
  on public.time_entries(idempotency_key)
  where idempotency_key is not null;

create index if not exists employees_branch_active_idx on public.employees(branch_id, active);
create index if not exists employees_payment_day_idx on public.employees(payment_day);
create index if not exists employees_branch_payment_day_idx on public.employees(branch_id, payment_day);
create index if not exists employees_registration_code_idx on public.employees(registration_code);
create index if not exists employees_document_idx on public.employees(document);
create index if not exists employees_full_name_trgm_idx on public.employees using gin (full_name gin_trgm_ops);

create index if not exists time_entries_employee_date_idx on public.time_entries(employee_id, entry_date);
create index if not exists time_entries_branch_date_idx on public.time_entries(branch_id, entry_date);
create index if not exists time_entries_date_action_idx on public.time_entries(entry_date, action);
create index if not exists time_entries_status_branch_date_idx on public.time_entries(status, branch_id, entry_date);

create index if not exists absence_justifications_status_branch_idx on public.absence_justifications(status, branch_id);
create index if not exists overtime_reviews_status_branch_idx on public.overtime_reviews(status, branch_id);
create index if not exists payroll_periods_branch_dates_idx on public.payroll_periods(branch_id, start_date, end_date);
create index if not exists payroll_periods_branch_payment_day_idx on public.payroll_periods(branch_id, payment_day);
create index if not exists payroll_items_period_employee_idx on public.payroll_items(payroll_period_id, employee_id);
create index if not exists audit_logs_created_action_idx on public.audit_logs(created_at, action);

comment on column public.employees.payment_day is 'Dia padrão de pagamento do colaborador, usado para filtros de folha por matriz/filial.';
comment on column public.employees.expected_lunch_start_time is 'Horário previsto de saída para almoço.';
comment on column public.employees.expected_lunch_end_time is 'Horário previsto de retorno do almoço.';
comment on column public.branches.gps_ready is 'Indica se o GPS da filial foi confirmado pelo RH/admin presencialmente.';
comment on column public.time_entries.idempotency_key is 'Chave para evitar duplicidade por duplo clique ou reenvio da mesma tentativa de ponto.';
