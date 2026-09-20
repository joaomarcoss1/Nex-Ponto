-- v017 Segurança Final e Homologação Produção — VERSÃO CORRIGIDA E IDEMPOTENTE
-- Substitui integralmente o arquivo anterior que falhava ao ser executado novamente.
-- Correções incrementais e não destrutivas: RLS por filial, idempotência da folha,
-- views seguras e proteção contra edição financeira indevida pelo acesso direto.

create extension if not exists "pgcrypto";

alter table public.payroll_periods
  add column if not exists idempotency_key text;

create unique index if not exists idx_payroll_periods_idempotency_key
  on public.payroll_periods(idempotency_key)
  where idempotency_key is not null;

create index if not exists idx_payroll_periods_period_filter
  on public.payroll_periods(branch_id, start_date, end_date, payment_day, status);

create index if not exists idx_employees_branch_payment_active
  on public.employees(branch_id, payment_day, active);

create index if not exists idx_time_entries_review_scope
  on public.time_entries(branch_id, employee_id, entry_date, status, occurrence_review_status);

create index if not exists idx_absence_justifications_scope
  on public.absence_justifications(branch_id, status, absence_date);

create index if not exists idx_overtime_reviews_scope
  on public.overtime_reviews(branch_id, status, entry_date);

-- Funções seguras para policies. SECURITY DEFINER evita recursão de RLS em admin_users.
create or replace function public.current_admin_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select au.id
  from public.admin_users au
  where au.active = true
    and (au.auth_user_id = auth.uid() or lower(au.email) = lower(auth.email()))
  order by au.created_at asc
  limit 1;
$$;

create or replace function public.current_admin_profile()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select au.role::text
  from public.admin_users au
  where au.active = true
    and (au.auth_user_id = auth.uid() or lower(au.email) = lower(auth.email()))
  order by au.created_at asc
  limit 1;
$$;

create or replace function public.current_admin_branch_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select au.branch_id
  from public.admin_users au
  where au.active = true
    and (au.auth_user_id = auth.uid() or lower(au.email) = lower(auth.email()))
  order by au.created_at asc
  limit 1;
$$;

create or replace function public.current_admin_allowed_branch_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    case
      when au.role::text = 'master_admin' then null
      when au.role::text in ('admin_geral','rh_financeiro','admin')
           and cardinality(coalesce(au.allowed_branch_ids, '{}')) = 0
           and au.branch_id is null then null
      when cardinality(coalesce(au.allowed_branch_ids, '{}')) > 0 then au.allowed_branch_ids
      when au.branch_id is not null then array[au.branch_id]
      else '{}'::uuid[]
    end,
    '{}'::uuid[]
  )
  from public.admin_users au
  where au.active = true
    and (au.auth_user_id = auth.uid() or lower(au.email) = lower(auth.email()))
  order by au.created_at asc
  limit 1;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_admin_id() is not null;
$$;

create or replace function public.is_master_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_admin_profile() = 'master_admin', false);
$$;

create or replace function public.has_financial_permission()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users au
    where au.active = true
      and (au.auth_user_id = auth.uid() or lower(au.email) = lower(auth.email()))
      and (au.role::text in ('master_admin','rh_financeiro') or coalesce(au.can_view_financial_data, false) = true)
  );
$$;

create or replace function public.admin_can_access_all_branches()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users au
    where au.active = true
      and (au.auth_user_id = auth.uid() or lower(au.email) = lower(auth.email()))
      and (
        au.role::text = 'master_admin'
        or (au.role::text in ('admin','admin_geral','rh_financeiro')
            and au.branch_id is null
            and cardinality(coalesce(au.allowed_branch_ids, '{}')) = 0)
      )
  );
$$;

create or replace function public.can_access_branch(branch_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.current_admin_id() is null then false
    when branch_uuid is null then public.admin_can_access_all_branches()
    when public.admin_can_access_all_branches() then true
    else branch_uuid = any(public.current_admin_allowed_branch_ids())
  end;
$$;

-- View operacional com dados financeiros mascarados quando não houver permissão.
create or replace view public.admin_employees_safe as
select
  e.id,
  e.registration_code,
  e.full_name,
  e.document,
  e.phone,
  e.role,
  e.sector,
  e.branch_id,
  e.employment_type,
  case when public.has_financial_permission() then e.monthly_salary else null end as monthly_salary,
  case when public.has_financial_permission() then e.daily_rate else null end as daily_rate,
  case when public.has_financial_permission() then e.daily_rate_mode else null end as daily_rate_mode,
  case when public.has_financial_permission() then e.pix_key else null end as pix_key,
  case when public.has_financial_permission() then e.bank_name else null end as bank_name,
  case when public.has_financial_permission() then e.bank_agency else null end as bank_agency,
  case when public.has_financial_permission() then e.bank_account else null end as bank_account,
  case when public.has_financial_permission() then e.bank_account_type else null end as bank_account_type,
  case when public.has_financial_permission() then e.payment_day else null end as payment_day,
  (e.pin_hash is not null and e.pin_hash <> '') as has_pin,
  e.active,
  e.admission_date,
  e.expected_start_time,
  e.expected_end_time,
  e.expected_daily_minutes,
  e.expected_lunch_minutes,
  e.expected_lunch_start_time,
  e.expected_lunch_end_time,
  e.work_days,
  e.allow_overtime,
  e.created_at,
  e.updated_at
from public.employees e
where public.can_access_branch(e.branch_id);

grant select on public.admin_employees_safe to authenticated;

-- Policies amplas antigas removidas e substituídas por escopo por filial/perfil.
drop policy if exists "admins manage employees" on public.employees;
drop policy if exists "admins manage time entries" on public.time_entries;
drop policy if exists "admins manage absence justifications" on public.absence_justifications;
drop policy if exists "admins manage overtime reviews" on public.overtime_reviews;
drop policy if exists "admins manage branch authorizations" on public.employee_branch_authorizations;
drop policy if exists "admins manage holidays" on public.holidays;
drop policy if exists "admins manage payroll periods" on public.payroll_periods;
drop policy if exists "admins manage payroll items" on public.payroll_items;
drop policy if exists "admins manage work schedules" on public.work_schedules;
drop policy if exists "admins manage salary history" on public.employee_salary_history;
drop policy if exists "admins manage payroll closure checks" on public.payroll_closure_checks;
drop policy if exists "admins read branches" on public.branches;
drop policy if exists "admins manage branches" on public.branches;
drop policy if exists "admins read audit logs" on public.audit_logs;
drop policy if exists "admins can read admin users" on public.admin_users;
drop policy if exists "master admins manage admin users" on public.admin_users;

-- Torna esta migration idempotente: remove qualquer policy v017 criada em uma
-- execução anterior antes de recriá-la. Assim, o arquivo pode ser executado
-- novamente sem o erro PostgreSQL 42710 (policy already exists).
do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and policyname like 'v017 %'
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end
$$;

create policy "v017 admins read own admin profile" on public.admin_users
for select to authenticated
using (public.is_master_admin() or id = public.current_admin_id());

create policy "v017 master manages admin users" on public.admin_users
for all to authenticated
using (public.is_master_admin())
with check (public.is_master_admin());

create policy "v017 read scoped branches" on public.branches
for select to authenticated
using (public.can_access_branch(id));

create policy "v017 manage branches restricted" on public.branches
for all to authenticated
using (public.current_admin_profile() in ('master_admin','admin','admin_geral') and public.can_access_branch(id))
with check (public.current_admin_profile() in ('master_admin','admin','admin_geral') and public.can_access_branch(id));

create policy "v017 manage scoped employees" on public.employees
for all to authenticated
using (public.can_access_branch(branch_id))
with check (public.can_access_branch(branch_id));

create policy "v017 manage scoped time entries" on public.time_entries
for all to authenticated
using (public.can_access_branch(branch_id))
with check (public.can_access_branch(branch_id));

create policy "v017 manage scoped justifications" on public.absence_justifications
for all to authenticated
using (public.can_access_branch(branch_id))
with check (public.can_access_branch(branch_id));

create policy "v017 manage scoped overtime" on public.overtime_reviews
for all to authenticated
using (public.can_access_branch(branch_id))
with check (public.can_access_branch(branch_id));

create policy "v017 manage scoped branch authorizations" on public.employee_branch_authorizations
for all to authenticated
using (public.can_access_branch(branch_id))
with check (
  public.can_access_branch(branch_id)
  and exists (select 1 from public.employees e where e.id = employee_id and public.can_access_branch(e.branch_id))
);

create policy "v017 read scoped holidays" on public.holidays
for select to authenticated
using (branch_id is null or public.can_access_branch(branch_id));

create policy "v017 manage scoped holidays" on public.holidays
for all to authenticated
using (
  public.current_admin_profile() in ('master_admin','admin','admin_geral')
  and (branch_id is null and public.admin_can_access_all_branches() or public.can_access_branch(branch_id))
)
with check (
  public.current_admin_profile() in ('master_admin','admin','admin_geral')
  and (branch_id is null and public.admin_can_access_all_branches() or public.can_access_branch(branch_id))
);

create policy "v017 manage scoped work schedules" on public.work_schedules
for all to authenticated
using (exists (select 1 from public.employees e where e.id = employee_id and public.can_access_branch(e.branch_id)))
with check (exists (select 1 from public.employees e where e.id = employee_id and public.can_access_branch(e.branch_id)));

create policy "v017 manage scoped payroll periods" on public.payroll_periods
for all to authenticated
using (public.has_financial_permission() and public.can_access_branch(branch_id))
with check (public.has_financial_permission() and public.can_access_branch(branch_id));

create policy "v017 manage scoped payroll items" on public.payroll_items
for all to authenticated
using (public.has_financial_permission() and public.can_access_branch(branch_id))
with check (public.has_financial_permission() and public.can_access_branch(branch_id));

create policy "v017 manage scoped salary history" on public.employee_salary_history
for all to authenticated
using (
  public.has_financial_permission()
  and exists (select 1 from public.employees e where e.id = employee_id and public.can_access_branch(e.branch_id))
)
with check (
  public.has_financial_permission()
  and exists (select 1 from public.employees e where e.id = employee_id and public.can_access_branch(e.branch_id))
);

create policy "v017 read audit logs restricted" on public.audit_logs
for select to authenticated
using (public.current_admin_profile() in ('master_admin','admin_geral'));

-- Acesso direto à tabela employees fica operacional e sem colunas financeiras/PIN;
-- dados financeiros ficam disponíveis pela API validada no backend ou pela view segura.
revoke select on public.employees from authenticated;
grant select (
  id, registration_code, full_name, document, phone, role, sector, branch_id,
  employment_type, active, admission_date, expected_start_time, expected_end_time,
  expected_daily_minutes, expected_lunch_minutes, expected_lunch_start_time,
  expected_lunch_end_time, work_days, allow_overtime, created_at, updated_at
) on public.employees to authenticated;

revoke update on public.employees from authenticated;
grant update (
  registration_code, full_name, document, phone, role, sector, branch_id,
  employment_type, active, admission_date, expected_start_time, expected_end_time,
  expected_daily_minutes, expected_lunch_minutes, expected_lunch_start_time,
  expected_lunch_end_time, work_days, allow_overtime, updated_at
) on public.employees to authenticated;

comment on column public.payroll_periods.idempotency_key is 'Chave técnica para impedir folha duplicada por duplo clique ou reenvio da mesma requisição.';
comment on view public.admin_employees_safe is 'View para consultas administrativas diretas com dados financeiros mascarados conforme perfil e escopo de filial.';


create policy "v017 manage scoped payroll closure checks" on public.payroll_closure_checks
for all to authenticated
using (
  public.has_financial_permission()
  and exists (select 1 from public.payroll_periods p where p.id = payroll_period_id and public.can_access_branch(p.branch_id))
)
with check (
  public.has_financial_permission()
  and exists (select 1 from public.payroll_periods p where p.id = payroll_period_id and public.can_access_branch(p.branch_id))
);


-- Confirmação final da execução.
do $$
begin
  raise notice 'Migration v017 corrigida aplicada com sucesso.';
end
$$;
