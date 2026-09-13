-- NexPonto v5.1 — substituição atômica dos resultados de cálculo.

create or replace function public.replace_payroll_run_results_v51(
  p_tenant_id uuid,
  p_run_id uuid,
  p_rubrics jsonb,
  p_divergences jsonb,
  p_summary jsonb,
  p_actor uuid
)
returns public.payroll_calculation_runs
language plpgsql security definer set search_path=public as $$
declare run_row public.payroll_calculation_runs%rowtype; item jsonb;
begin
  select * into run_row from public.payroll_calculation_runs where id=p_run_id and tenant_id=p_tenant_id for update;
  if not found then raise exception 'PAYROLL_RUN_NOT_FOUND'; end if;
  if run_row.status in ('closed','closed_with_exceptions','exported','paid','superseded') then raise exception 'PAYROLL_RUN_IMMUTABLE'; end if;
  if jsonb_typeof(coalesce(p_rubrics,'[]'::jsonb))<>'array' or jsonb_typeof(coalesce(p_divergences,'[]'::jsonb))<>'array' then raise exception 'INVALID_PAYROLL_RESULTS'; end if;

  delete from public.payroll_item_rubrics where tenant_id=p_tenant_id and calculation_run_id=p_run_id;
  delete from public.payroll_divergences where tenant_id=p_tenant_id and calculation_run_id=p_run_id;

  for item in select value from jsonb_array_elements(coalesce(p_rubrics,'[]'::jsonb)) loop
    insert into public.payroll_item_rubrics(
      tenant_id,calculation_run_id,payroll_item_id,employee_id,branch_id,rubric_id,rubric_code,rubric_name,rubric_type,
      quantity,reference_value,percentage,calculation_base,gross_value,rounding_adjustment,final_value,formula_snapshot,
      rule_version_id,source_type,source_id,sequence
    ) values (
      p_tenant_id,p_run_id,null,(item->>'employee_id')::uuid,(item->>'branch_id')::uuid,null,
      item->>'rubric_code',item->>'rubric_name',item->>'rubric_type',coalesce((item->>'quantity')::numeric,1),
      coalesce((item->>'reference_value')::numeric,0),coalesce((item->>'percentage')::numeric,0),
      coalesce((item->>'calculation_base')::numeric,0),coalesce((item->>'gross_value')::numeric,0),
      coalesce((item->>'rounding_adjustment')::numeric,0),coalesce((item->>'final_value')::numeric,0),
      coalesce(item->'formula_snapshot','{}'::jsonb),null,coalesce(item->>'source_type','engine_v51'),
      nullif(item->>'source_id','')::uuid,coalesce((item->>'sequence')::integer,100)
    );
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_divergences,'[]'::jsonb)) loop
    insert into public.payroll_divergences(tenant_id,calculation_run_id,employee_id,branch_id,code,severity,message,details)
    values(p_tenant_id,p_run_id,nullif(item->>'employee_id','')::uuid,nullif(item->>'branch_id','')::uuid,item->>'code',item->>'severity',item->>'message',coalesce(item->'details','{}'::jsonb));
  end loop;

  update public.payroll_calculation_runs
     set status='calculated',summary=coalesce(p_summary,'{}'::jsonb),completed_at=now(),updated_at=now(),error_message=null
   where id=p_run_id returning * into run_row;

  insert into public.audit_logs(tenant_id,user_email,action,entity,entity_id,reason,new_data)
  values(p_tenant_id,coalesce((select email from auth.users where id=p_actor),'system'),'calculate_professional_payroll','payroll_calculation_runs',p_run_id::text,'Cálculo profissional v5.1 substituído de forma transacional',p_summary);

  return run_row;
end $$;
revoke all on function public.replace_payroll_run_results_v51(uuid,uuid,jsonb,jsonb,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.replace_payroll_run_results_v51(uuid,uuid,jsonb,jsonb,jsonb,uuid) to service_role;
