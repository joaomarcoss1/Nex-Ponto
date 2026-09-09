-- Módulos profissionais finais: importação de funcionários, setores, banco de horas,
-- solicitações, notificações, QR de filial e evidências críticas.
-- Migration idempotente e segura para bases já existentes.

alter table public.employees add column if not exists sector text;
create index if not exists idx_employees_sector on public.employees(sector);

create table if not exists public.employee_import_batches (
  id uuid primary key default gen_random_uuid(),
  imported_by uuid references public.admin_users(id) on delete set null,
  source_filename text,
  total_rows integer not null default 0,
  created_count integer not null default 0,
  updated_count integer not null default 0,
  ignored_count integer not null default 0,
  error_count integer not null default 0,
  generated_pin_count integer not null default 0,
  summary jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_employee_import_batches_date on public.employee_import_batches(created_at desc);
alter table public.employee_import_batches enable row level security;
drop policy if exists "admins read employee imports" on public.employee_import_batches;
create policy "admins read employee imports" on public.employee_import_batches for select to authenticated using (public.is_admin());
drop policy if exists "admins insert employee imports" on public.employee_import_batches;
create policy "admins insert employee imports" on public.employee_import_batches for insert to authenticated with check (public.is_admin());

create table if not exists public.hour_bank_movements (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  movement_date date not null default current_date,
  minutes integer not null,
  movement_type text not null default 'manual_adjustment',
  origin text not null default 'manual',
  reason text not null,
  created_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_hour_bank_employee_date on public.hour_bank_movements(employee_id, movement_date desc);
create index if not exists idx_hour_bank_branch_date on public.hour_bank_movements(branch_id, movement_date desc);
alter table public.hour_bank_movements enable row level security;
drop policy if exists "admins read hour bank" on public.hour_bank_movements;
create policy "admins read hour bank" on public.hour_bank_movements for select to authenticated using (public.is_admin());
drop policy if exists "admins insert hour bank" on public.hour_bank_movements;
create policy "admins insert hour bank" on public.hour_bank_movements for insert to authenticated with check (public.is_admin());

create table if not exists public.shift_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  request_date date not null default current_date,
  request_type text not null default 'troca_turno',
  target_branch_id uuid references public.branches(id) on delete set null,
  reason text not null,
  status text not null default 'pending',
  admin_observation text,
  created_by uuid references public.admin_users(id) on delete set null,
  reviewed_by uuid references public.admin_users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_shift_requests_branch_status on public.shift_requests(branch_id, status, request_date desc);
alter table public.shift_requests enable row level security;
drop policy if exists "admins read shift requests" on public.shift_requests;
create policy "admins read shift requests" on public.shift_requests for select to authenticated using (public.is_admin());
drop policy if exists "admins write shift requests" on public.shift_requests;
create policy "admins write shift requests" on public.shift_requests for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table if not exists public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references public.admin_users(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade,
  title text not null,
  message text not null,
  notification_type text not null default 'info',
  read_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_admin_notifications_admin_date on public.admin_notifications(admin_user_id, created_at desc);
alter table public.admin_notifications enable row level security;
drop policy if exists "admins read notifications" on public.admin_notifications;
create policy "admins read notifications" on public.admin_notifications for select to authenticated using (public.is_admin());

create table if not exists public.branch_qr_tokens (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  token text not null unique,
  valid_until timestamptz,
  active boolean not null default true,
  created_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_branch_qr_tokens_branch_active on public.branch_qr_tokens(branch_id, active, created_at desc);
alter table public.branch_qr_tokens enable row level security;
drop policy if exists "admins read branch qr" on public.branch_qr_tokens;
create policy "admins read branch qr" on public.branch_qr_tokens for select to authenticated using (public.is_admin());
drop policy if exists "admins write branch qr" on public.branch_qr_tokens;
create policy "admins write branch qr" on public.branch_qr_tokens for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public.time_entries add column if not exists selfie_url text;
alter table public.time_entries add column if not exists qr_token_id uuid references public.branch_qr_tokens(id) on delete set null;

insert into public.system_settings (key, value) values
  ('require_qr_for_clock', 'false'::jsonb),
  ('require_qr_when_outside_radius', 'false'::jsonb),
  ('selfie_policy', '"critical_only"'::jsonb),
  ('employee_import_requires_registration_code', 'false'::jsonb)
on conflict (key) do nothing;
