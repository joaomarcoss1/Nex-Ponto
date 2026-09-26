-- NexPonto v5.1 — publicação transacional com validação de cobertura.

create or replace function public.upsert_schedule_cycle_v51(
  p_tenant_id uuid,p_cycle_id uuid,p_name text,p_code text,p_cycle_type text,p_description text,
  p_effective_from date,p_effective_until date,p_validation_policy text,p_configuration jsonb,p_days jsonb,p_actor uuid
)
returns public.schedule_cycles
language plpgsql security definer set search_path=public as $$
declare cycle_row public.schedule_cycles%rowtype; item jsonb; length_value integer;
begin
  if p_cycle_type not in ('5x2','6x1','12x36','week_ab','rotating_sundays','custom') then raise exception 'INVALID_CYCLE_TYPE'; end if;
  if p_validation_policy not in ('block','justify','warn') then raise exception 'INVALID_VALIDATION_POLICY'; end if;
  if jsonb_typeof(coalesce(p_days,'[]'::jsonb))<>'array' then raise exception 'CYCLE_DAYS_ARRAY_REQUIRED'; end if;
  length_value:=jsonb_array_length(p_days);
  if length_value<1 or length_value>90 then raise exception 'INVALID_CYCLE_LENGTH'; end if;
  if p_cycle_id is null then
    insert into public.schedule_cycles(tenant_id,name,code,cycle_type,cycle_length_days,description,effective_from,effective_until,configuration,validation_policy,active,created_by)
    values(p_tenant_id,trim(p_name),nullif(trim(p_code),''),p_cycle_type,length_value,p_description,p_effective_from,p_effective_until,coalesce(p_configuration,'{}'::jsonb),p_validation_policy,true,p_actor)
    returning * into cycle_row;
  else
    select * into cycle_row from public.schedule_cycles where id=p_cycle_id and tenant_id=p_tenant_id for update;
    if not found then raise exception 'CYCLE_NOT_FOUND'; end if;
    update public.schedule_cycles set name=trim(p_name),code=nullif(trim(p_code),''),cycle_type=p_cycle_type,cycle_length_days=length_value,description=p_description,effective_from=p_effective_from,effective_until=p_effective_until,configuration=coalesce(p_configuration,'{}'::jsonb),validation_policy=p_validation_policy,updated_at=now() where id=p_cycle_id returning * into cycle_row;
    delete from public.schedule_cycle_days where cycle_id=p_cycle_id and tenant_id=p_tenant_id;
  end if;
  for item in select value from jsonb_array_elements(p_days) loop
    insert into public.schedule_cycle_days(tenant_id,cycle_id,day_index,shift_template_id,is_day_off,notes)
    values(p_tenant_id,cycle_row.id,(item->>'day_index')::integer,nullif(item->>'shift_template_id','')::uuid,coalesce((item->>'is_day_off')::boolean,false),item->>'notes');
  end loop;
  insert into public.audit_logs(tenant_id,user_email,action,entity,entity_id,reason,new_data)
  values(p_tenant_id,coalesce((select email from auth.users where id=p_actor),'system'),'upsert_schedule_cycle_v51','schedule_cycles',cycle_row.id::text,'Ciclo de escala configurado',to_jsonb(cycle_row));
  return cycle_row;
end $$;
revoke all on function public.upsert_schedule_cycle_v51(uuid,uuid,text,text,text,text,date,date,text,jsonb,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.upsert_schedule_cycle_v51(uuid,uuid,text,text,text,text,date,date,text,jsonb,jsonb,uuid) to service_role;

create or replace function public.assign_schedule_cycle_v51(
  p_tenant_id uuid,p_employee_id uuid,p_branch_id uuid,p_cycle_id uuid,p_cycle_start_date date,p_effective_from date,p_effective_until date,p_actor uuid
)
returns public.employee_schedule_cycle_assignments
language plpgsql security definer set search_path=public as $$
declare row_value public.employee_schedule_cycle_assignments%rowtype;
begin
  if not exists(select 1 from public.employees where id=p_employee_id and tenant_id=p_tenant_id) then raise exception 'EMPLOYEE_NOT_FOUND'; end if;
  if not exists(select 1 from public.schedule_cycles where id=p_cycle_id and tenant_id=p_tenant_id and active) then raise exception 'CYCLE_NOT_FOUND'; end if;
  if exists(select 1 from public.payroll_periods where tenant_id=p_tenant_id and (branch_id is null or branch_id=p_branch_id) and p_effective_from between start_date and end_date and status::text in ('closed','closed_with_exceptions','paid')) then raise exception 'CLOSED_PERIOD'; end if;
  update public.employee_schedule_cycle_assignments set status='superseded',effective_until=least(coalesce(effective_until,p_effective_from-1),p_effective_from-1)
  where tenant_id=p_tenant_id and employee_id=p_employee_id and status='active' and effective_from<=p_effective_from;
  insert into public.employee_schedule_cycle_assignments(tenant_id,employee_id,branch_id,cycle_id,cycle_start_date,effective_from,effective_until,status,created_by)
  values(p_tenant_id,p_employee_id,p_branch_id,p_cycle_id,p_cycle_start_date,p_effective_from,p_effective_until,'active',p_actor)
  returning * into row_value;
  return row_value;
end $$;
revoke all on function public.assign_schedule_cycle_v51(uuid,uuid,uuid,uuid,date,date,date,uuid) from public,anon,authenticated;
grant execute on function public.assign_schedule_cycle_v51(uuid,uuid,uuid,uuid,date,date,date,uuid) to service_role;

create or replace function public.save_schedule_publication_v51(
  p_tenant_id uuid,p_publication_id uuid,p_branch_id uuid,p_period_start date,p_period_end date,p_occurrences jsonb,
  p_publish boolean,p_actor_user_id uuid,p_membership_id uuid,p_notes text default null
)
returns public.schedule_publications
language plpgsql security definer set search_path=public as $$
declare publication public.schedule_publications%rowtype; validation jsonb; blocking integer;
begin
  publication:=public.save_schedule_publication_v4(p_tenant_id,p_publication_id,p_branch_id,p_period_start,p_period_end,p_occurrences,false,p_actor_user_id,p_membership_id,p_notes);
  validation:=public.validate_schedule_publication_v51(p_tenant_id,publication.id);
  blocking:=coalesce((validation->>'blocking')::integer,0);
  if p_publish and blocking>0 then
    select * into publication from public.schedule_publications where id=publication.id;
    return publication;
  end if;
  if p_publish then
    update public.schedule_publications set status='superseded',updated_at=now()
    where tenant_id=p_tenant_id and branch_id=p_branch_id and id<>publication.id and status='published'
      and daterange(period_start,period_end,'[]') && daterange(p_period_start,p_period_end,'[]');
    update public.schedule_occurrences set status='published' where tenant_id=p_tenant_id and publication_id=publication.id;
    update public.schedule_publications set status='published',published_at=now(),published_by=p_actor_user_id,validation_summary=validation,updated_at=now() where id=publication.id returning * into publication;
    insert into public.audit_logs(tenant_id,membership_id,user_email,action,entity,entity_id,reason,new_data)
    values(p_tenant_id,p_membership_id,coalesce((select email from auth.users where id=p_actor_user_id),'system'),'publish_schedule_v51','schedule_publications',publication.id::text,coalesce(p_notes,'Publicação validada de escala'),validation);
  else
    select * into publication from public.schedule_publications where id=publication.id;
  end if;
  return publication;
end $$;
revoke all on function public.save_schedule_publication_v51(uuid,uuid,uuid,date,date,jsonb,boolean,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.save_schedule_publication_v51(uuid,uuid,uuid,date,date,jsonb,boolean,uuid,uuid,text) to service_role;
