-- NexPonto v5.1 — funções de integridade antes/depois da implantação.

create or replace function public.collect_tenant_integrity_metrics_v51(p_tenant_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  select jsonb_build_object(
    'tenant_id',p_tenant_id,
    'branches',(select count(*) from public.branches where tenant_id=p_tenant_id),
    'employees',(select count(*) from public.employees where tenant_id=p_tenant_id),
    'salary_history',(select count(*) from public.employee_salary_history where tenant_id=p_tenant_id),
    'salary_sum',(select coalesce(sum(monthly_salary),0) from public.employees where tenant_id=p_tenant_id),
    'time_entries',(select count(*) from public.time_entries where tenant_id=p_tenant_id),
    'work_sessions',(select count(*) from public.work_sessions where tenant_id=p_tenant_id),
    'schedules',(select count(*) from public.work_schedules where tenant_id=p_tenant_id),
    'hour_bank_signed_balance',(select coalesce(sum(public.hour_bank_signed_minutes_v51(movement_type,minutes)),0) from public.hour_bank_movements where tenant_id=p_tenant_id),
    'payroll_periods',(select count(*) from public.payroll_periods where tenant_id=p_tenant_id),
    'payroll_items',(select count(*) from public.payroll_items where tenant_id=p_tenant_id),
    'coordinates_signature',(select encode(digest(coalesce(string_agg(id::text||':'||coalesce(latitude::text,'')||':'||coalesce(longitude::text,''),'|' order by id),'empty'),'sha256'),'hex') from public.branches where tenant_id=p_tenant_id),
    'employee_signature',(select encode(digest(coalesce(string_agg(id::text||':'||coalesce(registration_code,'')||':'||coalesce(pin_hash,''),'|' order by id),'empty'),'sha256'),'hex') from public.employees where tenant_id=p_tenant_id)
  ) into result;
  return result;
end $$;

create or replace function public.save_integrity_snapshot_v51(p_migration_key text,p_phase text,p_tenant_id uuid)
returns public.migration_integrity_snapshots
language plpgsql security definer set search_path=public as $$
declare metrics_value jsonb; row_value public.migration_integrity_snapshots%rowtype;
begin
  if p_phase not in ('pre','post','rollback') then raise exception 'INVALID_INTEGRITY_PHASE'; end if;
  metrics_value:=public.collect_tenant_integrity_metrics_v51(p_tenant_id);
  insert into public.migration_integrity_snapshots(migration_key,phase,tenant_id,metrics,checksum)
  values(p_migration_key,p_phase,p_tenant_id,metrics_value,encode(digest(metrics_value::text,'sha256'),'hex'))
  on conflict(migration_key,phase,tenant_id) do update set metrics=excluded.metrics,checksum=excluded.checksum,created_at=now()
  returning * into row_value;
  return row_value;
end $$;
revoke all on function public.collect_tenant_integrity_metrics_v51(uuid) from public,anon,authenticated;
revoke all on function public.save_integrity_snapshot_v51(text,text,uuid) from public,anon,authenticated;
grant execute on function public.collect_tenant_integrity_metrics_v51(uuid) to service_role;
grant execute on function public.save_integrity_snapshot_v51(text,text,uuid) to service_role;
