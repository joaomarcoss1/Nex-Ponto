-- v016 Homologação 4 Lojas: segurança, GPS readiness e prévia incompleta da folha.

alter type public.payroll_status add value if not exists 'incomplete_preview';

alter table public.branches
  add column if not exists last_inside_radius_test_at timestamptz,
  add column if not exists last_outside_radius_test_at timestamptz;

alter table public.payroll_periods
  add column if not exists closure_snapshot jsonb,
  add column if not exists closure_checklist jsonb,
  add column if not exists closure_override_reason text,
  add column if not exists reopened_reason text;

create index if not exists idx_time_entries_branch_review_status
  on public.time_entries(branch_id, occurrence_review_status, entry_date);

create index if not exists idx_time_entries_employee_day_action_active
  on public.time_entries(employee_id, entry_date, action)
  where status in ('valid', 'pending_review', 'adjusted');

create index if not exists idx_employee_branch_authorizations_branch_active
  on public.employee_branch_authorizations(branch_id, active, starts_on, ends_on);

create index if not exists idx_holidays_branch_date_active
  on public.holidays(branch_id, holiday_date, active);

create index if not exists idx_payroll_periods_status_branch_payment
  on public.payroll_periods(status, branch_id, payment_day);

comment on column public.branches.last_inside_radius_test_at is 'Último teste de diagnóstico GPS realizado dentro do raio permitido da filial.';
comment on column public.branches.last_outside_radius_test_at is 'Último teste de diagnóstico GPS realizado fora do raio permitido da filial.';
