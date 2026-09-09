-- NexPonto v4.0 — cadastro/edição atômicos de funcionário, remuneração, escala e auditoria.

create or replace function public.upsert_employee_v4(
  p_tenant_id uuid,
  p_employee_id uuid,
  p_payload jsonb,
  p_pin_hash text,
  p_salary_effective_from date,
  p_schedule_effective_from date,
  p_reason text,
  p_actor_user_id uuid,
  p_membership_id uuid
)
returns public.employees
language plpgsql
security definer
set search_path=public
as $$
declare
  employee public.employees%rowtype;
  old_employee public.employees%rowtype;
  salary_date date := coalesce(p_salary_effective_from,current_date);
  schedule_date date := coalesce(p_schedule_effective_from,current_date);
  salary_changed boolean := false;
  schedule_changed boolean := false;
  financial_allowed boolean := coalesce((p_payload->>'financial_allowed')::boolean,false);
  incoming_salary numeric(12,2) := coalesce(nullif(p_payload->>'monthly_salary','')::numeric,0);
  incoming_daily_rate numeric(12,2) := nullif(p_payload->>'daily_rate','')::numeric;
  incoming_daily_mode public.daily_rate_mode := coalesce(nullif(p_payload->>'daily_rate_mode','')::public.daily_rate_mode,'automatic'::public.daily_rate_mode);
begin
  if p_tenant_id is null then raise exception 'TENANT_REQUIRED'; end if;
  if not exists(select 1 from public.branches where id=(p_payload->>'branch_id')::uuid and tenant_id=p_tenant_id and active) then
    raise exception 'BRANCH_NOT_FOUND';
  end if;
  if length(trim(coalesce(p_payload->>'full_name','')))<2 or length(trim(coalesce(p_payload->>'role','')))<2 then
    raise exception 'EMPLOYEE_REQUIRED_FIELDS';
  end if;
  if p_employee_id is null and (p_pin_hash is null or length(p_pin_hash)<20) then raise exception 'PIN_REQUIRED'; end if;
  if exists(
    select 1 from public.payroll_periods
    where tenant_id=p_tenant_id and status::text in ('closed','closed_with_exceptions','paid')
      and (salary_date between start_date and end_date or schedule_date between start_date and end_date)
  ) then raise exception 'CLOSED_PERIOD'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':'||coalesce(p_employee_id::text,p_payload->>'registration_code',p_payload->>'full_name'),0));

  if p_employee_id is null then
    insert into public.employees(
      tenant_id,registration_code,full_name,document,phone,role,sector,branch_id,employment_type,
      monthly_salary,daily_rate,daily_rate_mode,pix_key,bank_name,bank_agency,bank_account,bank_account_type,
      payment_day,pin_hash,active,admission_date,termination_date,expected_start_time,expected_end_time,
      expected_daily_minutes,expected_lunch_minutes,expected_lunch_start_time,expected_lunch_end_time,
      work_days,allow_overtime,schedule_confirmed,profile_notes
    ) values(
      p_tenant_id,nullif(trim(p_payload->>'registration_code'),''),trim(p_payload->>'full_name'),nullif(trim(p_payload->>'document'),''),
      nullif(trim(p_payload->>'phone'),''),trim(p_payload->>'role'),nullif(trim(p_payload->>'sector'),''),(p_payload->>'branch_id')::uuid,
      coalesce(nullif(p_payload->>'employment_type','')::public.employment_type,'mensalista'::public.employment_type),
      case when financial_allowed then incoming_salary else 0 end,case when financial_allowed then incoming_daily_rate else null end,
      case when financial_allowed then incoming_daily_mode else 'automatic'::public.daily_rate_mode end,
      case when financial_allowed then nullif(trim(p_payload->>'pix_key'),'') else null end,
      case when financial_allowed then nullif(trim(p_payload->>'bank_name'),'') else null end,
      case when financial_allowed then nullif(trim(p_payload->>'bank_agency'),'') else null end,
      case when financial_allowed then nullif(trim(p_payload->>'bank_account'),'') else null end,
      case when financial_allowed then nullif(trim(p_payload->>'bank_account_type'),'') else null end,
      case when financial_allowed then nullif(p_payload->>'payment_day','')::integer else null end,
      p_pin_hash,coalesce((p_payload->>'active')::boolean,true),coalesce(nullif(p_payload->>'admission_date','')::date,current_date),
      nullif(p_payload->>'termination_date','')::date,coalesce(nullif(p_payload->>'expected_start_time','')::time,'08:00'::time),
      coalesce(nullif(p_payload->>'expected_end_time','')::time,'17:00'::time),coalesce(nullif(p_payload->>'expected_daily_minutes','')::integer,480),
      coalesce(nullif(p_payload->>'expected_lunch_minutes','')::integer,60),nullif(p_payload->>'expected_lunch_start_time','')::time,
      nullif(p_payload->>'expected_lunch_end_time','')::time,
      coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'work_days','[1,2,3,4,5,6]'::jsonb))::integer),array[1,2,3,4,5,6]),
      coalesce((p_payload->>'allow_overtime')::boolean,true),true,nullif(trim(p_payload->>'profile_notes'),'')
    ) returning * into employee;

    if financial_allowed then
      insert into public.employee_salary_history(tenant_id,employee_id,monthly_salary,daily_rate,daily_rate_mode,effective_from,valid_from,reason,changed_by)
      values(p_tenant_id,employee.id,employee.monthly_salary,employee.daily_rate,employee.daily_rate_mode,salary_date,salary_date,coalesce(nullif(trim(p_reason),''),'Cadastro inicial'),p_actor_user_id);
    end if;
    insert into public.work_schedules(
      tenant_id,employee_id,branch_id,title,work_days,expected_start_time,expected_end_time,expected_daily_minutes,
      expected_lunch_minutes,expected_lunch_start_time,expected_lunch_end_time,effective_from,active,source_type,published_at,published_by
    ) values(
      p_tenant_id,employee.id,employee.branch_id,'Escala contratual',employee.work_days,employee.expected_start_time,employee.expected_end_time,
      employee.expected_daily_minutes,employee.expected_lunch_minutes,employee.expected_lunch_start_time,employee.expected_lunch_end_time,
      schedule_date,true,'contract',now(),p_actor_user_id
    );
  else
    select * into old_employee from public.employees where id=p_employee_id and tenant_id=p_tenant_id for update;
    if not found then raise exception 'EMPLOYEE_NOT_FOUND'; end if;
    salary_changed := financial_allowed and (
      old_employee.monthly_salary is distinct from incoming_salary or old_employee.daily_rate is distinct from incoming_daily_rate or old_employee.daily_rate_mode is distinct from incoming_daily_mode
    );
    schedule_changed := old_employee.branch_id is distinct from (p_payload->>'branch_id')::uuid
      or old_employee.expected_start_time is distinct from (p_payload->>'expected_start_time')::time
      or old_employee.expected_end_time is distinct from (p_payload->>'expected_end_time')::time
      or old_employee.expected_daily_minutes is distinct from (p_payload->>'expected_daily_minutes')::integer
      or old_employee.expected_lunch_minutes is distinct from (p_payload->>'expected_lunch_minutes')::integer
      or old_employee.expected_lunch_start_time is distinct from nullif(p_payload->>'expected_lunch_start_time','')::time
      or old_employee.expected_lunch_end_time is distinct from nullif(p_payload->>'expected_lunch_end_time','')::time
      or old_employee.work_days is distinct from array(select jsonb_array_elements_text(p_payload->'work_days')::integer);

    update public.employees set
      registration_code=nullif(trim(p_payload->>'registration_code'),''),full_name=trim(p_payload->>'full_name'),document=nullif(trim(p_payload->>'document'),''),
      phone=nullif(trim(p_payload->>'phone'),''),role=trim(p_payload->>'role'),sector=nullif(trim(p_payload->>'sector'),''),
      branch_id=case when schedule_date<=current_date then (p_payload->>'branch_id')::uuid else old_employee.branch_id end,
      employment_type=coalesce(nullif(p_payload->>'employment_type','')::public.employment_type,old_employee.employment_type),
      monthly_salary=case when financial_allowed and salary_date<=current_date then incoming_salary else old_employee.monthly_salary end,
      daily_rate=case when financial_allowed and salary_date<=current_date then incoming_daily_rate else old_employee.daily_rate end,
      daily_rate_mode=case when financial_allowed and salary_date<=current_date then incoming_daily_mode else old_employee.daily_rate_mode end,
      pix_key=case when financial_allowed then nullif(trim(p_payload->>'pix_key'),'') else old_employee.pix_key end,
      bank_name=case when financial_allowed then nullif(trim(p_payload->>'bank_name'),'') else old_employee.bank_name end,
      bank_agency=case when financial_allowed then nullif(trim(p_payload->>'bank_agency'),'') else old_employee.bank_agency end,
      bank_account=case when financial_allowed then nullif(trim(p_payload->>'bank_account'),'') else old_employee.bank_account end,
      bank_account_type=case when financial_allowed then nullif(trim(p_payload->>'bank_account_type'),'') else old_employee.bank_account_type end,
      payment_day=case when financial_allowed then nullif(p_payload->>'payment_day','')::integer else old_employee.payment_day end,
      pin_hash=coalesce(p_pin_hash,old_employee.pin_hash),active=coalesce((p_payload->>'active')::boolean,old_employee.active),
      admission_date=coalesce(nullif(p_payload->>'admission_date','')::date,old_employee.admission_date),termination_date=nullif(p_payload->>'termination_date','')::date,
      expected_start_time=case when schedule_date<=current_date then (p_payload->>'expected_start_time')::time else old_employee.expected_start_time end,
      expected_end_time=case when schedule_date<=current_date then (p_payload->>'expected_end_time')::time else old_employee.expected_end_time end,
      expected_daily_minutes=case when schedule_date<=current_date then (p_payload->>'expected_daily_minutes')::integer else old_employee.expected_daily_minutes end,
      expected_lunch_minutes=case when schedule_date<=current_date then (p_payload->>'expected_lunch_minutes')::integer else old_employee.expected_lunch_minutes end,
      expected_lunch_start_time=case when schedule_date<=current_date then nullif(p_payload->>'expected_lunch_start_time','')::time else old_employee.expected_lunch_start_time end,
      expected_lunch_end_time=case when schedule_date<=current_date then nullif(p_payload->>'expected_lunch_end_time','')::time else old_employee.expected_lunch_end_time end,
      work_days=case when schedule_date<=current_date then array(select jsonb_array_elements_text(p_payload->'work_days')::integer) else old_employee.work_days end,
      allow_overtime=coalesce((p_payload->>'allow_overtime')::boolean,old_employee.allow_overtime),profile_notes=nullif(trim(p_payload->>'profile_notes'),''),updated_at=now()
    where id=p_employee_id and tenant_id=p_tenant_id returning * into employee;

    if salary_changed then
      update public.employee_salary_history set valid_until=salary_date-1
      where tenant_id=p_tenant_id and employee_id=employee.id and valid_from<salary_date and (valid_until is null or valid_until>=salary_date);
      insert into public.employee_salary_history(tenant_id,employee_id,monthly_salary,daily_rate,daily_rate_mode,effective_from,valid_from,reason,changed_by)
      values(p_tenant_id,employee.id,incoming_salary,incoming_daily_rate,incoming_daily_mode,salary_date,salary_date,coalesce(nullif(trim(p_reason),''),'Alteração salarial'),p_actor_user_id);
    end if;
    if schedule_changed then
      update public.work_schedules set effective_until=schedule_date-1,updated_at=now()
      where tenant_id=p_tenant_id and employee_id=employee.id and active and source_type='contract' and effective_from<schedule_date and (effective_until is null or effective_until>=schedule_date);
      insert into public.work_schedules(
        tenant_id,employee_id,branch_id,title,work_days,expected_start_time,expected_end_time,expected_daily_minutes,
        expected_lunch_minutes,expected_lunch_start_time,expected_lunch_end_time,effective_from,active,source_type,published_at,published_by
      ) values(
        p_tenant_id,employee.id,(p_payload->>'branch_id')::uuid,'Escala contratual',array(select jsonb_array_elements_text(p_payload->'work_days')::integer),
        (p_payload->>'expected_start_time')::time,(p_payload->>'expected_end_time')::time,(p_payload->>'expected_daily_minutes')::integer,
        (p_payload->>'expected_lunch_minutes')::integer,nullif(p_payload->>'expected_lunch_start_time','')::time,nullif(p_payload->>'expected_lunch_end_time','')::time,
        schedule_date,true,'contract',now(),p_actor_user_id
      );
    end if;
  end if;

  insert into public.audit_logs(tenant_id,membership_id,user_email,action,entity,entity_id,reason,old_data,new_data,request_id)
  values(p_tenant_id,p_membership_id,coalesce((select email from auth.users where id=p_actor_user_id),'system'),
    case when p_employee_id is null then 'create' else 'update' end,'employees',employee.id::text,coalesce(nullif(trim(p_reason),''),'Cadastro de funcionário'),
    case when p_employee_id is null then null else to_jsonb(old_employee)-'pin_hash' end,to_jsonb(employee)-'pin_hash',gen_random_uuid()::text);
  return employee;
end $$;
revoke all on function public.upsert_employee_v4(uuid,uuid,jsonb,text,date,date,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.upsert_employee_v4(uuid,uuid,jsonb,text,date,date,text,uuid,uuid) to service_role;
