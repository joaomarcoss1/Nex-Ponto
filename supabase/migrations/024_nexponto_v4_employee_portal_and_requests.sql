-- NexPonto v4.0 — portal do funcionário e workflow de solicitações.

alter table public.shift_requests
  add column if not exists submitted_by_employee_id uuid references public.employees(id) on delete set null,
  add column if not exists workflow_status text not null default 'submitted',
  add column if not exists requested_start_time time,
  add column if not exists requested_end_time time,
  add column if not exists requested_interval jsonb,
  add column if not exists manager_reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists manager_reviewed_at timestamptz,
  add column if not exists hr_reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists hr_reviewed_at timestamptz,
  add column if not exists applied_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists idempotency_key text;

alter table public.shift_requests drop constraint if exists shift_requests_workflow_status_check;
alter table public.shift_requests add constraint shift_requests_workflow_status_check
  check (workflow_status in ('draft','submitted','manager_review','hr_review','approved','rejected','applied','cancelled'));
create unique index if not exists uq_shift_requests_tenant_idempotency
  on public.shift_requests(tenant_id,idempotency_key) where idempotency_key is not null;
create index if not exists idx_shift_requests_employee_workflow
  on public.shift_requests(tenant_id,employee_id,workflow_status,request_date desc);

-- A busca pública só ocorre por APIs/RPCs controladas; estas funções dão suporte a
-- operações atômicas e não são expostas a anon/authenticated.
create or replace function public.submit_employee_request_v4(
  p_tenant_id uuid,
  p_employee_id uuid,
  p_branch_id uuid,
  p_request_date date,
  p_request_type text,
  p_target_branch_id uuid,
  p_reason text,
  p_requested_start_time time,
  p_requested_end_time time,
  p_requested_interval jsonb,
  p_idempotency_key text
)
returns public.shift_requests
language plpgsql
security definer
set search_path=public
as $$
declare request_row public.shift_requests%rowtype;
begin
  if p_tenant_id is null or p_employee_id is null or p_branch_id is null then raise exception 'REQUEST_SCOPE_REQUIRED'; end if;
  if length(trim(coalesce(p_reason,'')))<10 then raise exception 'REQUEST_REASON_REQUIRED'; end if;
  if length(trim(coalesce(p_idempotency_key,'')))<12 then raise exception 'IDEMPOTENCY_REQUIRED'; end if;
  select * into request_row from public.shift_requests
   where tenant_id=p_tenant_id and idempotency_key=p_idempotency_key;
  if found then return request_row; end if;
  if not exists(select 1 from public.employees where id=p_employee_id and branch_id=p_branch_id and tenant_id=p_tenant_id and active) then
    raise exception 'EMPLOYEE_NOT_FOUND';
  end if;
  if p_target_branch_id is not null and not exists(select 1 from public.branches where id=p_target_branch_id and tenant_id=p_tenant_id and active) then
    raise exception 'TARGET_BRANCH_NOT_FOUND';
  end if;
  insert into public.shift_requests(
    tenant_id,employee_id,branch_id,request_date,request_type,target_branch_id,reason,status,workflow_status,
    submitted_by_employee_id,requested_start_time,requested_end_time,requested_interval,idempotency_key
  ) values(
    p_tenant_id,p_employee_id,p_branch_id,coalesce(p_request_date,current_date),p_request_type,p_target_branch_id,
    trim(p_reason),'pending','submitted',p_employee_id,p_requested_start_time,p_requested_end_time,
    coalesce(p_requested_interval,'{}'::jsonb),p_idempotency_key
  ) returning * into request_row;
  insert into public.admin_notifications(tenant_id,branch_id,title,message,notification_type,payload)
  values(p_tenant_id,p_branch_id,'Nova solicitação de funcionário','Há uma nova solicitação aguardando análise.','request',jsonb_build_object('request_id',request_row.id,'employee_id',p_employee_id,'type',p_request_type));
  return request_row;
end $$;
revoke all on function public.submit_employee_request_v4(uuid,uuid,uuid,date,text,uuid,text,time,time,jsonb,text) from public,anon,authenticated;
grant execute on function public.submit_employee_request_v4(uuid,uuid,uuid,date,text,uuid,text,time,time,jsonb,text) to service_role;

-- Portal notifications are immutable except for read_at via a dedicated RPC.
create or replace function public.mark_employee_notification_read_v4(
  p_tenant_id uuid,p_employee_id uuid,p_notification_id uuid
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  update public.employee_portal_notifications set read_at=coalesce(read_at,now())
  where id=p_notification_id and tenant_id=p_tenant_id and employee_id=p_employee_id;
  return found;
end $$;
revoke all on function public.mark_employee_notification_read_v4(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.mark_employee_notification_read_v4(uuid,uuid,uuid) to service_role;
