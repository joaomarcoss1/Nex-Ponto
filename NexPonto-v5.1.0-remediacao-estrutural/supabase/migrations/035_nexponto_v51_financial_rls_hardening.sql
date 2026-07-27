-- NexPonto v5.1 — separação rigorosa de leitura e escrita financeira.

create or replace function public.has_permission_v51(p_tenant_id uuid,p_permission text)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.tenant_memberships tm
    where tm.tenant_id=p_tenant_id and tm.auth_user_id=auth.uid() and tm.active
      and (coalesce(tm.permissions,'{}'::text[]) @> array['*']::text[] or coalesce(tm.permissions,'{}'::text[]) @> array[p_permission]::text[] or tm.role::text in ('tenant_owner','tenant_admin'))
  )
$$;

create or replace function public.can_view_financial_v51(p_tenant_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.has_permission_v51(p_tenant_id,'financial.view') or public.has_permission_v51(p_tenant_id,'payroll.view')
$$;

create or replace function public.can_write_financial_v51(p_tenant_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.has_permission_v51(p_tenant_id,'financial.write') or public.has_permission_v51(p_tenant_id,'payroll.write')
$$;

-- Remove policies genéricas e cria policies somente de leitura para usuários autenticados.
do $$
declare t text; p record;
begin
  foreach t in array array[
    'payroll_periods','payroll_items','payroll_calculation_runs','payroll_rubrics','payroll_item_rubrics',
    'payroll_divergences','payroll_approvals','payroll_legal_tables','employee_contract_rules','collective_agreements',
    'hour_bank_movements','overtime_reviews','report_exports'
  ] loop
    if to_regclass('public.'||t) is null then continue; end if;
    execute format('alter table public.%I enable row level security',t);
    for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy if exists %I on public.%I',p.policyname,t);
    end loop;
    execute format('create policy financial_select_v51 on public.%I for select to authenticated using (tenant_id=public.current_tenant_id() and public.can_view_financial_v51(tenant_id))',t);
  end loop;
end $$;

-- Escritas diretas não são concedidas a authenticated; ocorrem por RPCs service_role validadas.
revoke insert,update,delete on public.payroll_periods,public.payroll_items,public.payroll_calculation_runs,public.payroll_rubrics,public.payroll_item_rubrics,public.payroll_divergences,public.payroll_approvals,public.payroll_legal_tables,public.employee_contract_rules,public.collective_agreements,public.hour_bank_movements,public.overtime_reviews,public.report_exports from authenticated;

grant select on public.payroll_periods,public.payroll_items,public.payroll_calculation_runs,public.payroll_rubrics,public.payroll_item_rubrics,public.payroll_divergences,public.payroll_approvals,public.payroll_legal_tables,public.employee_contract_rules,public.collective_agreements,public.hour_bank_movements,public.overtime_reviews,public.report_exports to authenticated;
