-- NexPonto v5.1 — motor profissional versionado, rubricas e divergências.

create table if not exists public.payroll_calculation_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  payroll_period_id uuid not null references public.payroll_periods(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  version integer not null,
  status text not null default 'draft' check(status in ('draft','attendance_pending','calculated','checking','hr_approved','financial_approved','closed','closed_with_exceptions','exported','paid','reopened','superseded','failed')),
  calculation_mode text not null default 'parallel_simulation' check(calculation_mode in ('parallel_simulation','homologation','production')),
  idempotency_key text not null,
  started_at timestamptz,
  completed_at timestamptz,
  closed_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,
  integrity_hash text,
  summary jsonb not null default '{}'::jsonb,
  error_message text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,payroll_period_id,version),
  unique(tenant_id,idempotency_key)
);

create table if not exists public.payroll_rubrics (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  rubric_type text not null check(rubric_type in ('earning','deduction','informational','base','employer_charge')),
  calculation_type text not null check(calculation_type in ('fixed','percentage','quantity_reference','safe_formula','manual_controlled')),
  configuration jsonb not null default '{}'::jsonb,
  inss_incidence boolean not null default false,
  irrf_incidence boolean not null default false,
  fgts_incidence boolean not null default false,
  esocial_nature text,
  rounding_scale integer not null default 2 check(rounding_scale between 0 and 6),
  priority integer not null default 100,
  effective_from date not null,
  effective_until date,
  status text not null default 'draft' check(status in ('draft','pending_homologation','homologated','inactive')),
  homologated_by uuid references auth.users(id) on delete set null,
  homologated_at timestamptz,
  created_at timestamptz not null default now(),
  unique(tenant_id,code,effective_from),
  check(effective_until is null or effective_until>=effective_from)
);

create table if not exists public.payroll_item_rubrics (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  calculation_run_id uuid not null references public.payroll_calculation_runs(id) on delete cascade,
  payroll_item_id uuid references public.payroll_items(id) on delete set null,
  employee_id uuid not null references public.employees(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  rubric_id uuid references public.payroll_rubrics(id) on delete set null,
  rubric_code text not null,
  rubric_name text not null,
  rubric_type text not null,
  quantity numeric(18,6) not null default 1,
  reference_value numeric(18,6) not null default 0,
  percentage numeric(18,8) not null default 0,
  calculation_base numeric(18,6) not null default 0,
  gross_value numeric(18,6) not null default 0,
  rounding_adjustment numeric(18,6) not null default 0,
  final_value numeric(18,2) not null default 0,
  formula_snapshot jsonb not null default '{}'::jsonb,
  rule_version_id uuid references public.payroll_rule_versions(id) on delete set null,
  source_type text not null,
  source_id uuid,
  sequence integer not null default 100,
  created_at timestamptz not null default now()
);

create table if not exists public.payroll_divergences (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  calculation_run_id uuid not null references public.payroll_calculation_runs(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade,
  code text not null,
  severity text not null check(severity in ('info','warning','critical')),
  message text not null,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'open' check(status in ('open','acknowledged','resolved','accepted_exception')),
  resolution_reason text,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.payroll_approvals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  calculation_run_id uuid not null references public.payroll_calculation_runs(id) on delete cascade,
  approval_stage text not null check(approval_stage in ('hr','financial','close','payment')),
  decision text not null check(decision in ('approved','rejected','revoked')),
  reason text,
  approved_by uuid not null references auth.users(id) on delete restrict,
  approved_at timestamptz not null default now(),
  unique(calculation_run_id,approval_stage,approved_at)
);

create unique index if not exists uq_payroll_active_run_v51
  on public.payroll_calculation_runs(tenant_id,payroll_period_id)
  where status not in ('superseded','failed','reopened');
create index if not exists idx_payroll_rubrics_run_employee_v51 on public.payroll_item_rubrics(tenant_id,calculation_run_id,employee_id,sequence);
create index if not exists idx_payroll_divergences_open_v51 on public.payroll_divergences(tenant_id,calculation_run_id,severity,status);

create or replace function public.create_payroll_run_v51(
  p_tenant_id uuid,p_payroll_period_id uuid,p_branch_id uuid,p_mode text,p_idempotency_key text,p_actor uuid
)
returns public.payroll_calculation_runs
language plpgsql security definer set search_path=public as $$
declare row_value public.payroll_calculation_runs%rowtype; next_version integer;
begin
  if p_mode not in ('parallel_simulation','homologation','production') then raise exception 'INVALID_CALCULATION_MODE'; end if;
  if exists(select 1 from public.payroll_calculation_runs where tenant_id=p_tenant_id and idempotency_key=p_idempotency_key) then
    select * into row_value from public.payroll_calculation_runs where tenant_id=p_tenant_id and idempotency_key=p_idempotency_key;
    return row_value;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':'||p_payroll_period_id::text,0));
  if not exists(select 1 from public.payroll_periods where id=p_payroll_period_id and tenant_id=p_tenant_id) then raise exception 'PAYROLL_PERIOD_NOT_FOUND'; end if;
  if exists(select 1 from public.payroll_calculation_runs where tenant_id=p_tenant_id and payroll_period_id=p_payroll_period_id and status not in ('superseded','failed','reopened')) then raise exception 'ACTIVE_PAYROLL_RUN_EXISTS'; end if;
  select coalesce(max(version),0)+1 into next_version from public.payroll_calculation_runs where tenant_id=p_tenant_id and payroll_period_id=p_payroll_period_id;
  insert into public.payroll_calculation_runs(tenant_id,payroll_period_id,branch_id,version,status,calculation_mode,idempotency_key,started_at,created_by)
  values(p_tenant_id,p_payroll_period_id,p_branch_id,next_version,'draft',p_mode,p_idempotency_key,now(),p_actor)
  returning * into row_value;
  return row_value;
end $$;
revoke all on function public.create_payroll_run_v51(uuid,uuid,uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.create_payroll_run_v51(uuid,uuid,uuid,text,text,uuid) to service_role;

create or replace function public.transition_payroll_run_v51(
  p_tenant_id uuid,p_run_id uuid,p_target_status text,p_reason text,p_actor uuid
)
returns public.payroll_calculation_runs
language plpgsql security definer set search_path=public as $$
declare row_value public.payroll_calculation_runs%rowtype; critical_count integer; allowed boolean:=false;
begin
  select * into row_value from public.payroll_calculation_runs where id=p_run_id and tenant_id=p_tenant_id for update;
  if not found then raise exception 'PAYROLL_RUN_NOT_FOUND'; end if;
  allowed := (row_value.status='draft' and p_target_status in ('attendance_pending','calculated')) or
             (row_value.status='attendance_pending' and p_target_status='calculated') or
             (row_value.status='calculated' and p_target_status='checking') or
             (row_value.status='checking' and p_target_status='hr_approved') or
             (row_value.status='hr_approved' and p_target_status='financial_approved') or
             (row_value.status='financial_approved' and p_target_status in ('closed','closed_with_exceptions')) or
             (row_value.status in ('closed','closed_with_exceptions') and p_target_status='exported') or
             (row_value.status='exported' and p_target_status='paid');
  if not allowed then raise exception 'INVALID_PAYROLL_TRANSITION:%->%',row_value.status,p_target_status; end if;
  select count(*) into critical_count from public.payroll_divergences where tenant_id=p_tenant_id and calculation_run_id=p_run_id and severity='critical' and status='open';
  if p_target_status in ('closed','closed_with_exceptions') and critical_count>0 and p_target_status<>'closed_with_exceptions' then raise exception 'CRITICAL_DIVERGENCES_OPEN'; end if;
  update public.payroll_calculation_runs
     set status=p_target_status,completed_at=case when p_target_status in ('calculated','closed','closed_with_exceptions') then now() else completed_at end,
         closed_at=case when p_target_status in ('closed','closed_with_exceptions') then now() else closed_at end,
         closed_by=case when p_target_status in ('closed','closed_with_exceptions') then p_actor else closed_by end,
         integrity_hash=case when p_target_status in ('closed','closed_with_exceptions') then encode(digest(id::text||version::text||coalesce(summary,'{}'::jsonb)::text||now()::text,'sha256'),'hex') else integrity_hash end,
         updated_at=now()
   where id=p_run_id returning * into row_value;
  if p_target_status in ('hr_approved','financial_approved','closed','closed_with_exceptions','paid') then
    insert into public.payroll_approvals(tenant_id,calculation_run_id,approval_stage,decision,reason,approved_by)
    values(
      p_tenant_id,
      p_run_id,
      case
        when p_target_status='hr_approved' then 'hr'
        when p_target_status='financial_approved' then 'financial'
        when p_target_status in ('closed','closed_with_exceptions') then 'close'
        else 'payment'
      end,
      'approved',
      p_reason,
      p_actor
    );
  end if;
  return row_value;
end $$;
revoke all on function public.transition_payroll_run_v51(uuid,uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.transition_payroll_run_v51(uuid,uuid,text,text,uuid) to service_role;
