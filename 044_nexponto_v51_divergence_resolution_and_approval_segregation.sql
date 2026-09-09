-- NexPonto v5.1 — resolução auditável de divergências e segregação de aprovação.

create or replace function public.resolve_payroll_divergence_v51(
  p_tenant_id uuid,
  p_divergence_id uuid,
  p_decision text,
  p_reason text,
  p_actor uuid
)
returns public.payroll_divergences
language plpgsql security definer set search_path=public
as $$
declare row_value public.payroll_divergences%rowtype;
begin
  if p_decision not in ('acknowledged','resolved','accepted_exception') then raise exception 'INVALID_DIVERGENCE_DECISION'; end if;
  if length(trim(coalesce(p_reason,'')))<10 then raise exception 'DIVERGENCE_REASON_REQUIRED'; end if;
  select * into row_value from public.payroll_divergences where id=p_divergence_id and tenant_id=p_tenant_id for update;
  if not found then raise exception 'DIVERGENCE_NOT_FOUND'; end if;
  if exists(select 1 from public.payroll_calculation_runs r where r.id=row_value.calculation_run_id and r.status in ('closed','closed_with_exceptions','exported','paid')) then raise exception 'PAYROLL_RUN_IMMUTABLE'; end if;
  update public.payroll_divergences
     set status=p_decision,resolution_reason=trim(p_reason),resolved_by=p_actor,resolved_at=now()
   where id=p_divergence_id returning * into row_value;
  insert into public.audit_logs(tenant_id,user_email,action,entity,entity_id,reason,new_data)
  values(p_tenant_id,coalesce((select email from auth.users where id=p_actor),'system'),'resolve_payroll_divergence_v51','payroll_divergences',row_value.id::text,trim(p_reason),jsonb_build_object('decision',p_decision,'severity',row_value.severity,'code',row_value.code));
  return row_value;
end $$;
revoke all on function public.resolve_payroll_divergence_v51(uuid,uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.resolve_payroll_divergence_v51(uuid,uuid,text,text,uuid) to service_role;

create or replace function public.transition_payroll_run_v51(
  p_tenant_id uuid,p_run_id uuid,p_target_status text,p_reason text,p_actor uuid
)
returns public.payroll_calculation_runs
language plpgsql security definer set search_path=public as $$
declare
  row_value public.payroll_calculation_runs%rowtype;
  unresolved_critical integer;
  accepted_critical integer;
  allowed boolean:=false;
  segregation_enabled boolean:=false;
  prior_actor uuid;
begin
  if length(trim(coalesce(p_reason,'')))<5 then raise exception 'PAYROLL_TRANSITION_REASON_REQUIRED'; end if;
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

  select coalesce((value->>'segregation_enabled')::boolean,false) into segregation_enabled
  from public.tenant_settings where tenant_id=p_tenant_id and key='payroll.approval' limit 1;
  if segregation_enabled and p_target_status='financial_approved' then
    select approved_by into prior_actor from public.payroll_approvals where calculation_run_id=p_run_id and approval_stage='hr' and decision='approved' order by approved_at desc limit 1;
    if prior_actor is not null and prior_actor=p_actor then raise exception 'SEGREGATION_OF_DUTIES_REQUIRED'; end if;
  end if;
  if segregation_enabled and p_target_status in ('closed','closed_with_exceptions') then
    select approved_by into prior_actor from public.payroll_approvals where calculation_run_id=p_run_id and approval_stage='financial' and decision='approved' order by approved_at desc limit 1;
    if prior_actor is not null and prior_actor=p_actor then raise exception 'SEGREGATION_OF_DUTIES_REQUIRED'; end if;
  end if;

  select count(*) filter(where status not in ('resolved','accepted_exception')),
         count(*) filter(where status='accepted_exception')
    into unresolved_critical,accepted_critical
  from public.payroll_divergences
  where tenant_id=p_tenant_id and calculation_run_id=p_run_id and severity='critical';

  if p_target_status='closed' and (unresolved_critical>0 or accepted_critical>0) then raise exception 'CRITICAL_DIVERGENCES_BLOCK_NORMAL_CLOSE'; end if;
  if p_target_status='closed_with_exceptions' and (unresolved_critical>0 or accepted_critical=0) then raise exception 'CRITICAL_DIVERGENCES_REQUIRE_ACCEPTED_EXCEPTION'; end if;

  update public.payroll_calculation_runs
     set status=p_target_status,
         completed_at=case when p_target_status in ('calculated','closed','closed_with_exceptions') then now() else completed_at end,
         closed_at=case when p_target_status in ('closed','closed_with_exceptions') then now() else closed_at end,
         closed_by=case when p_target_status in ('closed','closed_with_exceptions') then p_actor else closed_by end,
         integrity_hash=case when p_target_status in ('closed','closed_with_exceptions') then encode(digest(id::text||version::text||coalesce(summary,'{}'::jsonb)::text||p_target_status||now()::text,'sha256'),'hex') else integrity_hash end,
         updated_at=now()
   where id=p_run_id returning * into row_value;

  if p_target_status in ('hr_approved','financial_approved','closed','closed_with_exceptions','paid') then
    insert into public.payroll_approvals(tenant_id,calculation_run_id,approval_stage,decision,reason,approved_by)
    values(p_tenant_id,p_run_id,case when p_target_status='hr_approved' then 'hr' when p_target_status='financial_approved' then 'financial' when p_target_status in ('closed','closed_with_exceptions') then 'close' else 'payment' end,'approved',trim(p_reason),p_actor);
  end if;
  return row_value;
end $$;
revoke all on function public.transition_payroll_run_v51(uuid,uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.transition_payroll_run_v51(uuid,uuid,text,text,uuid) to service_role;
