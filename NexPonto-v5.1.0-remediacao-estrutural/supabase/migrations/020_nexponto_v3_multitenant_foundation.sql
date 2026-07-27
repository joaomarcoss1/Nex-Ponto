-- NexPonto v3.0 — fundação SaaS multiempresa, RBAC, auditoria de plataforma e isolamento.
-- Migração incremental: preserva a instalação v2 criando um tenant padrão e preenchendo tenant_id.

create extension if not exists pgcrypto;

create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  active boolean not null default true,
  employee_limit integer,
  branch_limit integer,
  storage_limit_mb integer,
  monthly_price_cents integer not null default 0 check (monthly_price_cents >= 0),
  features jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  legal_name text not null,
  display_name text not null,
  document text,
  status text not null default 'trial' check (status in ('trial','active','suspended','cancelled')),
  default_timezone text not null default 'America/Sao_Paulo',
  plan_id uuid references public.subscription_plans(id) on delete set null,
  onboarding_status text not null default 'pending' check (onboarding_status in ('pending','in_progress','ready','blocked')),
  activated_at timestamptz,
  suspended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_superadmins (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null,
  active boolean not null default true,
  mfa_required boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  admin_user_id uuid references public.admin_users(id) on delete set null,
  role text not null,
  permissions text[] not null default '{}',
  branch_ids uuid[] not null default '{}',
  active boolean not null default true,
  invited_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, auth_user_id)
);

create table if not exists public.tenant_settings (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  key text not null,
  value jsonb not null,
  version integer not null default 1,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, key)
);

create table if not exists public.tenant_branding (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  app_name text not null default 'NexPonto',
  short_name text not null default 'NexPonto',
  tagline text not null default 'Gestão inteligente de jornadas',
  logo_url text,
  mark_url text,
  favicon_url text,
  pwa_icon_url text,
  login_image_url text,
  primary_color text not null default '#1268F3',
  secondary_color text not null default '#F4B51C',
  accent_color text not null default '#22A5F5',
  background_color text not null default '#F5F7FB',
  surface_color text not null default '#FFFFFF',
  report_footer text,
  support_email text,
  support_phone text,
  version integer not null default 1,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_features (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  feature_key text not null,
  enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, feature_key)
);

create table if not exists public.tenant_domains (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  hostname text not null unique,
  verified boolean not null default false,
  verification_token_hash text,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.tenant_usage (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  metric_date date not null default current_date,
  employees_count integer not null default 0,
  branches_count integer not null default 0,
  storage_bytes bigint not null default 0,
  report_exports_count integer not null default 0,
  time_entries_count bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, metric_date)
);

create table if not exists public.tenant_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id),
  status text not null default 'trialing' check (status in ('trialing','active','past_due','suspended','cancelled')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  external_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_access_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  platform_superadmin_id uuid not null references public.platform_superadmins(id),
  approved_by uuid references auth.users(id),
  reason text not null check (length(trim(reason)) >= 10),
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  status text not null default 'pending' check (status in ('pending','approved','active','expired','revoked')),
  created_at timestamptz not null default now(),
  check (expires_at > starts_at)
);

create table if not exists public.platform_audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  tenant_id uuid references public.tenants(id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id text,
  request_id text,
  ip_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

insert into public.subscription_plans(code,name,description,employee_limit,branch_limit,storage_limit_mb,features)
values
 ('starter','Starter','Operação inicial',50,2,1024,'{"reports":true,"offline":false}'::jsonb),
 ('professional','Profissional','Empresas com múltiplas filiais',500,20,10240,'{"reports":true,"offline":true,"advanced_schedules":true}'::jsonb),
 ('enterprise','Enterprise','Operações corporativas',null,null,null,'{"reports":true,"offline":true,"advanced_schedules":true,"sso":true}'::jsonb)
on conflict (code) do nothing;

insert into public.tenants(slug,legal_name,display_name,status,onboarding_status,plan_id)
select 'tenant-principal','Empresa principal','Empresa principal','active','in_progress',id
from public.subscription_plans where code='professional'
on conflict (slug) do nothing;

-- Adiciona tenant_id a todas as entidades da instalação existente.
do $$
declare
  t text;
  tables text[] := array[
    'admin_users','branches','employees','employee_salary_history','work_schedules',
    'employee_branch_authorizations','holidays','time_entries','absence_justifications',
    'payroll_periods','payroll_items','overtime_reviews','audit_logs','system_settings',
    'pin_attempt_logs','branch_operating_hours','shift_templates','holiday_operation_decisions',
    'employee_import_batches','hour_bank_movements','shift_requests','admin_notifications',
    'branch_qr_tokens','payroll_closure_checks','payroll_homologation_checks',
    'branch_geolocation_history','report_export_logs'
  ];
  default_tenant uuid;
begin
  select id into default_tenant from public.tenants where slug='tenant-principal';
  foreach t in array tables loop
    if to_regclass('public.'||t) is not null then
      execute format('alter table public.%I add column if not exists tenant_id uuid references public.tenants(id) on delete restrict',t);
      execute format('update public.%I set tenant_id=$1 where tenant_id is null',t) using default_tenant;
      execute format('alter table public.%I alter column tenant_id set not null',t);
      execute format('create index if not exists %I on public.%I(tenant_id)', 'idx_'||t||'_tenant', t);
    end if;
  end loop;
end $$;

-- Garante que usuários administrativos existentes tenham membership no tenant padrão.
insert into public.tenant_memberships(tenant_id,auth_user_id,admin_user_id,role,permissions,branch_ids,active,accepted_at)
select t.id,a.auth_user_id,a.id,a.role,
       case when a.role='master_admin' then array['*']::text[] else array[]::text[] end,
       coalesce(a.allowed_branch_ids,'{}'::uuid[]),a.active,now()
from public.admin_users a
cross join public.tenants t
where t.slug='tenant-principal' and a.auth_user_id is not null
on conflict (tenant_id,auth_user_id) do update
set admin_user_id=excluded.admin_user_id, role=excluded.role, active=excluded.active, updated_at=now();

insert into public.tenant_branding(tenant_id,app_name,short_name,tagline,logo_url,mark_url,primary_color,secondary_color,accent_color,background_color,surface_color)
select t.id,
 coalesce((select value#>>'{}' from public.system_settings where key='app_name' and tenant_id=t.id),'NexPonto'),
 coalesce((select value#>>'{}' from public.system_settings where key='app_short_name' and tenant_id=t.id),'NexPonto'),
 coalesce((select value#>>'{}' from public.system_settings where key='app_tagline' and tenant_id=t.id),'Gestão inteligente de jornadas'),
 coalesce((select value#>>'{}' from public.system_settings where key='logo_url' and tenant_id=t.id),'/nexponto-logo.svg'),
 coalesce((select value#>>'{}' from public.system_settings where key='mark_url' and tenant_id=t.id),'/nexponto-mark.svg'),
 coalesce((select value#>>'{}' from public.system_settings where key='primary_color' and tenant_id=t.id),'#1268F3'),
 coalesce((select value#>>'{}' from public.system_settings where key='secondary_color' and tenant_id=t.id),'#F4B51C'),
 coalesce((select value#>>'{}' from public.system_settings where key='accent_color' and tenant_id=t.id),'#22A5F5'),
 coalesce((select value#>>'{}' from public.system_settings where key='background_color' and tenant_id=t.id),'#F5F7FB'),
 coalesce((select value#>>'{}' from public.system_settings where key='surface_color' and tenant_id=t.id),'#FFFFFF')
from public.tenants t where t.slug='tenant-principal'
on conflict (tenant_id) do nothing;

create or replace function public.current_tenant_id()
returns uuid language sql stable security definer set search_path=public
as $$
  select tm.tenant_id
  from public.tenant_memberships tm
  where tm.auth_user_id=auth.uid() and tm.active
  order by tm.accepted_at desc nulls last, tm.created_at desc
  limit 1
$$;

create or replace function public.is_platform_superadmin()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.platform_superadmins p where p.auth_user_id=auth.uid() and p.active) $$;

create or replace function public.has_tenant_role(p_tenant_id uuid, p_roles text[])
returns boolean language sql stable security definer set search_path=public
as $$
 select exists(select 1 from public.tenant_memberships tm where tm.auth_user_id=auth.uid() and tm.tenant_id=p_tenant_id and tm.active and tm.role=any(p_roles))
$$;

create or replace function public.has_permission(p_tenant_id uuid,p_permission text)
returns boolean language sql stable security definer set search_path=public
as $$
 select exists(select 1 from public.tenant_memberships tm where tm.auth_user_id=auth.uid() and tm.tenant_id=p_tenant_id and tm.active and ('*'=any(tm.permissions) or p_permission=any(tm.permissions)))
$$;

create or replace function public.can_access_branch(p_tenant_id uuid,p_branch_id uuid)
returns boolean language sql stable security definer set search_path=public
as $$
 select exists(
  select 1 from public.tenant_memberships tm
  where tm.auth_user_id=auth.uid() and tm.tenant_id=p_tenant_id and tm.active
    and (tm.role in ('tenant_owner','tenant_admin','master_admin','admin','admin_geral','rh_financeiro') or p_branch_id=any(tm.branch_ids))
 )
$$;

-- Trigger de integridade: filhos devem pertencer ao mesmo tenant da filial/funcionário.
create or replace function public.enforce_tenant_from_branch()
returns trigger language plpgsql set search_path=public as $$
declare bt uuid;
begin
 if new.branch_id is null then return new; end if;
 select tenant_id into bt from public.branches where id=new.branch_id;
 if bt is null or bt<>new.tenant_id then raise exception 'TENANT_BRANCH_MISMATCH'; end if;
 return new;
end $$;

do $$ declare t text; tables text[]:=array['employees','work_schedules','employee_branch_authorizations','holidays','time_entries','payroll_periods','branch_operating_hours','shift_templates','holiday_operation_decisions','branch_qr_tokens']; begin
 foreach t in array tables loop
  if to_regclass('public.'||t) is not null then
   execute format('drop trigger if exists trg_%I_tenant_branch on public.%I',t,t);
   execute format('create trigger trg_%I_tenant_branch before insert or update of tenant_id,branch_id on public.%I for each row execute function public.enforce_tenant_from_branch()',t,t);
  end if;
 end loop;
end $$;

-- RLS base para tabelas SaaS.
alter table public.tenants enable row level security;
alter table public.tenant_memberships enable row level security;
alter table public.tenant_settings enable row level security;
alter table public.tenant_branding enable row level security;
alter table public.tenant_features enable row level security;
alter table public.tenant_domains enable row level security;
alter table public.tenant_usage enable row level security;
alter table public.tenant_subscriptions enable row level security;
alter table public.support_access_sessions enable row level security;
alter table public.platform_audit_logs enable row level security;
alter table public.platform_superadmins enable row level security;

drop policy if exists tenants_member_read on public.tenants;
create policy tenants_member_read on public.tenants for select to authenticated using (id=public.current_tenant_id() or public.is_platform_superadmin());
drop policy if exists memberships_self_or_admin on public.tenant_memberships;
create policy memberships_self_or_admin on public.tenant_memberships for select to authenticated using (auth_user_id=auth.uid() or tenant_id=public.current_tenant_id() or public.is_platform_superadmin());
drop policy if exists tenant_settings_member on public.tenant_settings;
create policy tenant_settings_member on public.tenant_settings for all to authenticated using (tenant_id=public.current_tenant_id()) with check (tenant_id=public.current_tenant_id());
drop policy if exists tenant_branding_public_read on public.tenant_branding;
create policy tenant_branding_public_read on public.tenant_branding for select to anon,authenticated using (true);
drop policy if exists tenant_branding_admin_write on public.tenant_branding;
create policy tenant_branding_admin_write on public.tenant_branding for all to authenticated using (tenant_id=public.current_tenant_id()) with check (tenant_id=public.current_tenant_id());
drop policy if exists tenant_features_member_read on public.tenant_features;
create policy tenant_features_member_read on public.tenant_features for select to authenticated using (tenant_id=public.current_tenant_id() or public.is_platform_superadmin());
drop policy if exists tenant_domains_member on public.tenant_domains;
create policy tenant_domains_member on public.tenant_domains for select to authenticated using (tenant_id=public.current_tenant_id() or public.is_platform_superadmin());
drop policy if exists tenant_usage_member on public.tenant_usage;
create policy tenant_usage_member on public.tenant_usage for select to authenticated using (tenant_id=public.current_tenant_id() or public.is_platform_superadmin());
drop policy if exists tenant_subscriptions_member on public.tenant_subscriptions;
create policy tenant_subscriptions_member on public.tenant_subscriptions for select to authenticated using (tenant_id=public.current_tenant_id() or public.is_platform_superadmin());
drop policy if exists support_sessions_parties on public.support_access_sessions;
create policy support_sessions_parties on public.support_access_sessions for select to authenticated using (tenant_id=public.current_tenant_id() or public.is_platform_superadmin());
drop policy if exists platform_audit_superadmin on public.platform_audit_logs;
create policy platform_audit_superadmin on public.platform_audit_logs for select to authenticated using (public.is_platform_superadmin());
drop policy if exists platform_superadmins_self on public.platform_superadmins;
create policy platform_superadmins_self on public.platform_superadmins for select to authenticated using (auth_user_id=auth.uid());

-- Tenant isolation policies on operational tables. Existing service-role jobs continue explicit and audited.
do $$
declare t text; tables text[]:=array[
 'admin_users','branches','employees','employee_salary_history','work_schedules','employee_branch_authorizations','holidays','time_entries','absence_justifications','payroll_periods','payroll_items','overtime_reviews','audit_logs','system_settings','pin_attempt_logs','branch_operating_hours','shift_templates','holiday_operation_decisions','employee_import_batches','hour_bank_movements','shift_requests','admin_notifications','branch_qr_tokens','payroll_closure_checks','payroll_homologation_checks','branch_geolocation_history','report_export_logs'
];
begin
 foreach t in array tables loop
  if to_regclass('public.'||t) is not null then
   execute format('alter table public.%I enable row level security',t);
   execute format('drop policy if exists tenant_isolation on public.%I',t);
   execute format('create policy tenant_isolation on public.%I for all to authenticated using (tenant_id=public.current_tenant_id()) with check (tenant_id=public.current_tenant_id())',t);
  end if;
 end loop;
end $$;

create index if not exists idx_memberships_auth_active on public.tenant_memberships(auth_user_id,active,tenant_id);
create index if not exists idx_tenants_status on public.tenants(status,onboarding_status);
create index if not exists idx_platform_audit_tenant_created on public.platform_audit_logs(tenant_id,created_at desc);
