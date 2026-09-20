-- NexPonto v5.5.4 - PIN em lote atômico e ciclo completo de jobs.
begin;

create or replace function public.bulk_set_employee_pins_v554(
  p_tenant_id uuid,
  p_rows jsonb,
  p_actor uuid
)
returns table(id uuid)
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  input_count integer;
  unique_count integer;
  tenant_count integer;
  updated_ids uuid[];
begin
  if p_tenant_id is null or p_actor is null then
    raise exception 'PIN_BULK_CONTEXT_REQUIRED';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'PIN_BULK_ROWS_INVALID';
  end if;

  select count(*), count(distinct item->>'id')
    into input_count,unique_count
    from jsonb_array_elements(p_rows) item;
  if input_count < 1 or input_count > 500 or input_count <> unique_count then
    raise exception 'PIN_BULK_SIZE_OR_DUPLICATE_INVALID';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_rows) item
     where coalesce(item->>'id','') = ''
        or coalesce(item->>'pin_hash','') !~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$'
        or item - array['id','pin_hash'] <> '{}'::jsonb
  ) then
    raise exception 'PIN_BULK_PAYLOAD_INVALID';
  end if;

  perform employee.id
    from public.employees employee
    join jsonb_to_recordset(p_rows) as input(id uuid,pin_hash text) on input.id=employee.id
   where employee.tenant_id=p_tenant_id
   for update of employee;
  get diagnostics tenant_count = row_count;
  if tenant_count <> input_count then
    raise exception 'PIN_BULK_CROSS_TENANT_RESOURCE';
  end if;

  with input as (
    select * from jsonb_to_recordset(p_rows) as row_value(id uuid,pin_hash text)
  ), updated as (
    update public.employees employee
       set pin_hash=input.pin_hash,updated_at=now()
      from input
     where employee.id=input.id and employee.tenant_id=p_tenant_id
    returning employee.id
  )
  select array_agg(updated.id order by updated.id) into updated_ids from updated;

  if coalesce(cardinality(updated_ids),0) <> input_count then
    raise exception 'PIN_BULK_ATOMIC_UPDATE_FAILED';
  end if;
  insert into public.audit_logs(tenant_id,user_id,user_email,action,entity,new_data)
  values(p_tenant_id,p_actor,'sistema','bulk_generate_pin','employees',
    jsonb_build_object('ids',to_jsonb(updated_ids),'generatedPins',true,'count',input_count));
  return query select unnest(updated_ids);
end $$;
revoke all on function public.bulk_set_employee_pins_v554(uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.bulk_set_employee_pins_v554(uuid,jsonb,uuid) to service_role;

create or replace function public.claim_background_job_v554(
  p_worker_id text,
  p_job_types text[]
)
returns setof public.background_jobs
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  claimed public.background_jobs%rowtype;
begin
  if nullif(trim(p_worker_id),'') is null or coalesce(cardinality(p_job_types),0)=0 then
    raise exception 'JOB_CLAIM_CONTEXT_REQUIRED';
  end if;

  with expired as (
    update public.background_jobs
       set status='dead_letter',worker_id=null,lease_expires_at=null,completed_at=now(),
           error_code='JOB_LEASE_EXPIRED',error_message='Lease expirou após o limite de tentativas.',updated_at=now()
     where status='running' and lease_expires_at<=now() and attempts>=max_attempts
    returning tenant_id,id,attempts
  )
  insert into public.background_job_events(tenant_id,job_id,event_type,details)
  select tenant_id,id,'dead_letter',jsonb_build_object('error_code','JOB_LEASE_EXPIRED','attempt',attempts)
    from expired;

  select * into claimed
    from public.background_jobs
   where job_type=any(p_job_types)
     and ((status='queued' and run_after<=now()) or (status='running' and lease_expires_at<=now()))
     and attempts<max_attempts
   order by run_after,created_at
   for update skip locked
   limit 1;
  if not found then return; end if;

  update public.background_jobs
     set status='running',attempts=attempts+1,worker_id=p_worker_id,
         started_at=coalesce(started_at,now()),last_heartbeat_at=now(),
         lease_expires_at=now()+interval '5 minutes',updated_at=now()
   where public.background_jobs.id=claimed.id
  returning * into claimed;
  insert into public.background_job_events(tenant_id,job_id,event_type,details)
  values(claimed.tenant_id,claimed.id,'claimed',jsonb_build_object('worker_id',p_worker_id,'attempt',claimed.attempts));
  return next claimed;
end $$;
revoke all on function public.claim_background_job_v554(text,text[]) from public,anon,authenticated;
grant execute on function public.claim_background_job_v554(text,text[]) to service_role;

create or replace function public.fail_background_job_v554(
  p_job_id uuid,
  p_worker_id text,
  p_error_code text,
  p_error_message text
)
returns public.background_jobs
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  job public.background_jobs%rowtype;
begin
  update public.background_jobs
     set status=case when attempts>=max_attempts then 'dead_letter' else 'queued' end,
         error_code=left(coalesce(p_error_code,'JOB_FAILED'),120),
         error_message=left(coalesce(p_error_message,'Falha no processamento.'),2000),
         run_after=case when attempts>=max_attempts then run_after else now()+make_interval(secs=>least(3600,power(2,attempts)::integer*30)) end,
         completed_at=case when attempts>=max_attempts then now() else null end,
         lease_expires_at=null,worker_id=null,updated_at=now()
   where id=p_job_id and status='running' and worker_id=p_worker_id
  returning * into job;
  if not found then raise exception 'JOB_LEASE_LOST'; end if;
  insert into public.background_job_events(tenant_id,job_id,event_type,details)
  values(job.tenant_id,job.id,
    case when job.status='dead_letter' then 'dead_letter' else 'retry_scheduled' end,
    jsonb_build_object('error_code',job.error_code,'attempt',job.attempts,'worker_id',p_worker_id));
  return job;
end $$;
revoke all on function public.fail_background_job_v554(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.fail_background_job_v554(uuid,text,text,text) to service_role;

insert into public.nexponto_schema_versions(version,notes)
values('5.5.4','PIN em lote atômico, recuperação de leases expirados e falha de jobs vinculada ao worker')
on conflict(version) do nothing;

commit;
