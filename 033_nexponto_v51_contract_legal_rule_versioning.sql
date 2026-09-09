-- NexPonto v5.1 — regras contratuais e tabelas legais determinísticas.

create table if not exists public.collective_agreements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  effective_from date not null,
  effective_until date,
  source_url text,
  status text not null default 'draft' check(status in ('draft','pending_homologation','homologated','inactive')),
  checksum text,
  homologated_by uuid references auth.users(id) on delete set null,
  homologated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(effective_until is null or effective_until>=effective_from),
  unique(tenant_id,code,effective_from)
);

create table if not exists public.payroll_rule_sets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  name text not null,
  status text not null default 'draft' check(status in ('draft','pending_homologation','homologated','inactive')),
  created_at timestamptz not null default now(),
  unique(tenant_id,code)
);

create table if not exists public.payroll_rule_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  rule_set_id uuid not null references public.payroll_rule_sets(id) on delete cascade,
  version integer not null,
  effective_from date not null,
  effective_until date,
  rules jsonb not null default '{}'::jsonb,
  checksum text not null,
  status text not null default 'draft' check(status in ('draft','pending_homologation','homologated','inactive')),
  homologated_by uuid references auth.users(id) on delete set null,
  homologated_at timestamptz,
  created_at timestamptz not null default now(),
  check(effective_until is null or effective_until>=effective_from),
  unique(rule_set_id,version)
);

create table if not exists public.employee_contract_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  salary_hour_divisor numeric(10,4) not null check(salary_hour_divisor>0),
  salary_day_divisor numeric(10,4) not null default 30 check(salary_day_divisor>0),
  weekly_hours numeric(10,2),
  monthly_hours numeric(10,2),
  payroll_rule_set_id uuid references public.payroll_rule_sets(id) on delete set null,
  collective_agreement_id uuid references public.collective_agreements(id) on delete set null,
  night_shift_rule jsonb not null default '{}'::jsonb,
  absence_policy jsonb not null default '{}'::jsonb,
  lateness_policy jsonb not null default '{}'::jsonb,
  proportionality_rule jsonb not null default '{"type":"salary_divided_by_30"}'::jsonb,
  effective_from date not null,
  effective_until date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check(effective_until is null or effective_until>=effective_from)
);

create table if not exists public.payroll_legal_tables (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  table_type text not null,
  scope_key text not null default 'default',
  version text not null,
  effective_from date not null,
  effective_until date,
  source_name text,
  source_url text,
  published_at date,
  status text not null default 'draft' check(status in ('draft','pending_homologation','homologated','inactive')),
  checksum text not null,
  homologated_by uuid references auth.users(id) on delete set null,
  homologated_at timestamptz,
  created_at timestamptz not null default now(),
  check(effective_until is null or effective_until>=effective_from),
  unique(tenant_id,table_type,scope_key,version)
);

create table if not exists public.payroll_legal_brackets (
  id uuid primary key default gen_random_uuid(),
  legal_table_id uuid not null references public.payroll_legal_tables(id) on delete cascade,
  sequence integer not null,
  lower_bound numeric(16,4) not null default 0,
  upper_bound numeric(16,4),
  rate numeric(12,8) not null,
  deduction numeric(16,4) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  unique(legal_table_id,sequence),
  check(upper_bound is null or upper_bound>=lower_bound)
);

create or replace function public.prevent_effective_overlap_v51()
returns trigger language plpgsql set search_path=public as $$
declare overlap_exists boolean;
begin
  if tg_table_name='employee_contract_rules' then
    select exists(select 1 from public.employee_contract_rules x where x.id<>new.id and x.tenant_id=new.tenant_id and x.employee_id=new.employee_id and daterange(x.effective_from,coalesce(x.effective_until,'infinity'::date),'[]') && daterange(new.effective_from,coalesce(new.effective_until,'infinity'::date),'[]')) into overlap_exists;
  elsif tg_table_name='payroll_legal_tables' then
    select exists(select 1 from public.payroll_legal_tables x where x.id<>new.id and x.tenant_id is not distinct from new.tenant_id and x.table_type=new.table_type and x.scope_key=new.scope_key and x.status<>'inactive' and daterange(x.effective_from,coalesce(x.effective_until,'infinity'::date),'[]') && daterange(new.effective_from,coalesce(new.effective_until,'infinity'::date),'[]')) into overlap_exists;
  elsif tg_table_name='payroll_rule_versions' then
    select exists(select 1 from public.payroll_rule_versions x where x.id<>new.id and x.rule_set_id=new.rule_set_id and x.status<>'inactive' and daterange(x.effective_from,coalesce(x.effective_until,'infinity'::date),'[]') && daterange(new.effective_from,coalesce(new.effective_until,'infinity'::date),'[]')) into overlap_exists;
  else overlap_exists:=false;
  end if;
  if overlap_exists then raise exception 'EFFECTIVE_PERIOD_OVERLAP'; end if;
  return new;
end $$;

drop trigger if exists trg_contract_rules_overlap_v51 on public.employee_contract_rules;
create trigger trg_contract_rules_overlap_v51 before insert or update on public.employee_contract_rules for each row execute function public.prevent_effective_overlap_v51();
drop trigger if exists trg_legal_tables_overlap_v51 on public.payroll_legal_tables;
create trigger trg_legal_tables_overlap_v51 before insert or update on public.payroll_legal_tables for each row execute function public.prevent_effective_overlap_v51();
drop trigger if exists trg_rule_versions_overlap_v51 on public.payroll_rule_versions;
create trigger trg_rule_versions_overlap_v51 before insert or update on public.payroll_rule_versions for each row execute function public.prevent_effective_overlap_v51();

create index if not exists idx_contract_rules_tenant_employee_effective_v51 on public.employee_contract_rules(tenant_id,employee_id,effective_from,effective_until);
create index if not exists idx_legal_tables_scope_effective_v51 on public.payroll_legal_tables(tenant_id,table_type,scope_key,effective_from,effective_until,status);
