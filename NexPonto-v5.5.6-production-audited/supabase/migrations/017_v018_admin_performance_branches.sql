-- NexPonto: escopo administrativo, índices e geofence.
-- Nenhuma filial ou pessoa é criada por esta migration.

create extension if not exists "pgcrypto";

alter type public.admin_role add value if not exists 'admin_geral';
alter type public.admin_role add value if not exists 'gerente_filial';

alter table public.admin_users
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null,
  add column if not exists branch_id uuid references public.branches(id) on delete set null,
  add column if not exists allowed_branch_ids uuid[] not null default '{}',
  add column if not exists can_view_financial_data boolean not null default false,
  add column if not exists active boolean not null default true;

alter table public.branches
  add column if not exists google_maps_url text,
  add column if not exists map_place_id text,
  add column if not exists geofence_enabled boolean not null default true;

update public.admin_users au
set auth_user_id = u.id,
    updated_at = now()
from auth.users u
where au.auth_user_id is null
  and lower(au.email) = lower(u.email);

update public.admin_users
set branch_id = null,
    allowed_branch_ids = '{}',
    active = true,
    can_view_financial_data = true,
    updated_at = now()
where role::text = 'master_admin';

create index if not exists idx_admin_users_email_lower_v018
  on public.admin_users(lower(email));
create index if not exists idx_admin_users_auth_active_v018
  on public.admin_users(auth_user_id, active);
create index if not exists idx_branches_active_name_v018
  on public.branches(active, name);
create index if not exists idx_employees_branch_active_name_v018
  on public.employees(branch_id, active, full_name);
create index if not exists idx_payroll_periods_branch_created_v018
  on public.payroll_periods(branch_id, created_at desc);
create index if not exists idx_time_entries_branch_date_v018
  on public.time_entries(branch_id, entry_date);

analyze public.admin_users;
analyze public.branches;
analyze public.employees;
analyze public.payroll_periods;
analyze public.time_entries;
