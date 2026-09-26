-- Melhorias finais alinhadas ao prompt de conclusão do NexPonto.
-- Esta migration é segura/idempotente e reforça estruturas usadas pelas novas telas e relatórios.

alter table public.employee_salary_history
  add column if not exists valid_from date,
  add column if not exists valid_until date,
  add column if not exists reason text;

update public.employee_salary_history
set valid_from = coalesce(valid_from, effective_from, created_at::date)
where valid_from is null;

create index if not exists idx_employee_salary_history_employee_validity_final
  on public.employee_salary_history(employee_id, valid_from, valid_until);

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

create index if not exists idx_pin_attempt_logs_employee_window_final
  on public.pin_attempt_logs(employee_id, success, created_at desc);

alter table public.pin_attempt_logs enable row level security;

drop policy if exists "admins read pin attempt logs final" on public.pin_attempt_logs;
create policy "admins read pin attempt logs final" on public.pin_attempt_logs
for select to authenticated using (public.is_admin());

insert into public.system_settings (key, value) values
  ('allow_outside_radius_review', 'false'::jsonb),
  ('auto_approve_overtime', 'false'::jsonb),
  ('primary_color', '"#078d3a"'::jsonb),
  ('secondary_color', '"#ffc107"'::jsonb)
on conflict (key) do nothing;
