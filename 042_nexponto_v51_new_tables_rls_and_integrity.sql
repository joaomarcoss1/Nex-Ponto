-- NexPonto v5.1 — RLS e integridade para todas as novas entidades.

-- Relações de tenant consistentes.
do $$
declare item record;
begin
  for item in select * from (values
    ('employee_contract_rules','employees','employee_id'),
    ('payroll_item_rubrics','employees','employee_id'),
    ('employee_schedule_cycle_assignments','employees','employee_id')
  ) as v(table_name,relation_table,relation_column)
  loop
    if to_regclass('public.'||item.table_name) is not null then
      execute format('drop trigger if exists trg_%I_tenant_relation_v51 on public.%I',item.table_name,item.table_name);
      execute format('create trigger trg_%I_tenant_relation_v51 before insert or update of tenant_id,%I on public.%I for each row execute function public.enforce_tenant_relation(''%I'',''%I'')',item.table_name,item.relation_column,item.table_name,item.relation_table,item.relation_column);
    end if;
  end loop;
end $$;

-- Tabelas financeiras com tenant_id: somente leitura via RLS; escrita por RPC/service role.
do $$
declare t text; p record;
begin
  foreach t in array array[
    'payroll_rule_sets','payroll_rule_versions','payroll_rubrics','payroll_item_rubrics','payroll_divergences','payroll_approvals',
    'payroll_calculation_runs','payroll_legal_tables','employee_contract_rules','collective_agreements','legacy_payroll_write_blocks'
  ] loop
    if to_regclass('public.'||t) is null then continue; end if;
    execute format('alter table public.%I enable row level security',t);
    for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy if exists %I on public.%I',p.policyname,t);
    end loop;
    execute format('create policy financial_select_v51 on public.%I for select to authenticated using (tenant_id=public.current_tenant_id() and public.can_view_financial_v51(tenant_id))',t);
    execute format('revoke insert,update,delete on public.%I from authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
  end loop;
end $$;

alter table public.payroll_legal_brackets enable row level security;
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='payroll_legal_brackets' loop
    execute format('drop policy if exists %I on public.payroll_legal_brackets',p.policyname);
  end loop;
end $$;
create policy legal_brackets_select_v51 on public.payroll_legal_brackets for select to authenticated
using(exists(select 1 from public.payroll_legal_tables t where t.id=legal_table_id and (t.tenant_id is null or (t.tenant_id=public.current_tenant_id() and public.can_view_financial_v51(t.tenant_id)))));
revoke insert,update,delete on public.payroll_legal_brackets from authenticated;
grant select on public.payroll_legal_brackets to authenticated;

-- Escalas: leitura pelo tenant/filial; escrita somente por APIs/RPCs controladas.
do $$
declare t text; p record;
begin
  foreach t in array array['employee_schedule_cycle_assignments','schedule_validation_issues'] loop
    if to_regclass('public.'||t) is null then continue; end if;
    execute format('alter table public.%I enable row level security',t);
    for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy if exists %I on public.%I',p.policyname,t);
    end loop;
    execute format('create policy schedule_select_v51 on public.%I for select to authenticated using (tenant_id=public.current_tenant_id() and public.can_access_branch(tenant_id,branch_id))',t);
    execute format('revoke insert,update,delete on public.%I from authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
  end loop;
end $$;

alter table public.migration_integrity_snapshots enable row level security;
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='migration_integrity_snapshots' loop
    execute format('drop policy if exists %I on public.migration_integrity_snapshots',p.policyname);
  end loop;
end $$;
revoke all on public.migration_integrity_snapshots from anon,authenticated;

create index if not exists idx_payroll_runs_tenant_period_status_v51 on public.payroll_calculation_runs(tenant_id,payroll_period_id,status,version desc);
create index if not exists idx_payroll_legal_brackets_table_sequence_v51 on public.payroll_legal_brackets(legal_table_id,sequence);
create index if not exists idx_payroll_rules_tenant_status_v51 on public.payroll_rule_sets(tenant_id,status);
create index if not exists idx_payroll_rubrics_tenant_effective_v51 on public.payroll_rubrics(tenant_id,effective_from,effective_until,status);
