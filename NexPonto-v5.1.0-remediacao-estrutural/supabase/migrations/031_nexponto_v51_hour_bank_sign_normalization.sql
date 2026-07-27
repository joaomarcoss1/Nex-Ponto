-- NexPonto v5.1 — normalização segura e imutável do banco de horas.

create table if not exists public.migration_integrity_snapshots (
  id uuid primary key default gen_random_uuid(),
  migration_key text not null,
  phase text not null check (phase in ('pre','post','rollback')),
  tenant_id uuid references public.tenants(id) on delete cascade,
  metrics jsonb not null,
  checksum text not null,
  created_at timestamptz not null default now(),
  unique(migration_key,phase,tenant_id)
);

alter table public.hour_bank_movements
  add column if not exists competence_date date,
  add column if not exists idempotency_key text,
  add column if not exists overtime_review_id uuid references public.overtime_reviews(id) on delete set null,
  add column if not exists payroll_item_id uuid references public.payroll_items(id) on delete set null,
  add column if not exists request_id uuid references public.shift_requests(id) on delete set null,
  add column if not exists source_movement_id uuid references public.hour_bank_movements(id) on delete set null,
  add column if not exists rule_snapshot jsonb not null default '{}'::jsonb;

update public.hour_bank_movements
set competence_date = coalesce(competence_date, date_trunc('month',movement_date)::date)
where competence_date is null;

-- O trigger imutável é suspenso apenas durante a normalização controlada.
drop trigger if exists trg_hour_bank_immutable_update on public.hour_bank_movements;

update public.hour_bank_movements
set movement_type = case
      when minutes < 0 and movement_type not in ('debit','compensation') then 'debit'
      when minutes > 0 and movement_type in ('debit','compensation') then movement_type
      when minutes > 0 and movement_type = 'manual_adjustment' then 'credit'
      else movement_type
    end,
    minutes = abs(minutes)
where minutes < 0 or movement_type='manual_adjustment';

alter table public.hour_bank_movements drop constraint if exists hour_bank_minutes_positive_v51;
alter table public.hour_bank_movements add constraint hour_bank_minutes_positive_v51 check (minutes > 0) not valid;
alter table public.hour_bank_movements validate constraint hour_bank_minutes_positive_v51;

create unique index if not exists uq_hour_bank_tenant_idempotency_v51
  on public.hour_bank_movements(tenant_id,idempotency_key)
  where idempotency_key is not null;
create index if not exists idx_hour_bank_tenant_competence_employee_v51
  on public.hour_bank_movements(tenant_id,competence_date,employee_id,status);

create or replace function public.hour_bank_signed_minutes_v51(p_type text,p_minutes integer)
returns integer
language sql immutable parallel safe
as $$
  select case when p_type in ('debit','compensation','expired','paid') then -abs(p_minutes) else abs(p_minutes) end
$$;

create or replace function public.append_hour_bank_movement_v51(
  p_tenant_id uuid,
  p_employee_id uuid,
  p_branch_id uuid,
  p_movement_date date,
  p_minutes integer,
  p_movement_type text,
  p_origin text,
  p_reason text,
  p_idempotency_key text,
  p_created_by uuid,
  p_approved_by uuid default null,
  p_expires_on date default null,
  p_reversal_of uuid default null,
  p_overtime_review_id uuid default null,
  p_payroll_item_id uuid default null,
  p_request_id uuid default null,
  p_rule_snapshot jsonb default '{}'::jsonb
)
returns public.hour_bank_movements
language plpgsql security definer set search_path=public
as $$
declare
  previous_balance integer;
  signed_value integer;
  movement public.hour_bank_movements%rowtype;
begin
  if p_tenant_id is null or p_employee_id is null or p_branch_id is null then raise exception 'HOUR_BANK_SCOPE_REQUIRED'; end if;
  if p_minutes is null or p_minutes <= 0 then raise exception 'HOUR_BANK_MINUTES_MUST_BE_POSITIVE'; end if;
  if p_movement_type not in ('credit','debit','compensation','manual_adjustment','reversal','expired','paid') then raise exception 'INVALID_HOUR_BANK_TYPE'; end if;
  if length(trim(coalesce(p_reason,''))) < 5 then raise exception 'HOUR_BANK_REASON_REQUIRED'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 then raise exception 'HOUR_BANK_IDEMPOTENCY_REQUIRED'; end if;
  if not exists(select 1 from public.employees e where e.id=p_employee_id and e.tenant_id=p_tenant_id) then raise exception 'EMPLOYEE_NOT_FOUND'; end if;
  if not exists(select 1 from public.branches b where b.id=p_branch_id and b.tenant_id=p_tenant_id) then raise exception 'BRANCH_NOT_FOUND'; end if;
  if exists(select 1 from public.payroll_periods pp where pp.tenant_id=p_tenant_id and (pp.branch_id is null or pp.branch_id=p_branch_id) and p_movement_date between pp.start_date and pp.end_date and pp.status::text in ('closed','closed_with_exceptions','paid')) then raise exception 'CLOSED_PERIOD'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':'||p_employee_id::text,0));
  select * into movement from public.hour_bank_movements where tenant_id=p_tenant_id and idempotency_key=p_idempotency_key;
  if found then return movement; end if;

  select coalesce(sum(public.hour_bank_signed_minutes_v51(movement_type,minutes)),0)::integer
    into previous_balance
  from public.hour_bank_movements
  where tenant_id=p_tenant_id and employee_id=p_employee_id and status in ('approved','pending');

  signed_value := public.hour_bank_signed_minutes_v51(p_movement_type,p_minutes);

  insert into public.hour_bank_movements(
    tenant_id,employee_id,branch_id,movement_date,competence_date,minutes,movement_type,origin,reason,
    idempotency_key,balance_before,balance_after,expires_on,reversal_of,source_movement_id,
    overtime_review_id,payroll_item_id,request_id,rule_snapshot,created_by,approved_by,approved_at,status
  ) values (
    p_tenant_id,p_employee_id,p_branch_id,coalesce(p_movement_date,current_date),date_trunc('month',coalesce(p_movement_date,current_date))::date,
    abs(p_minutes),p_movement_type,coalesce(nullif(trim(p_origin),''),'manual'),trim(p_reason),trim(p_idempotency_key),
    previous_balance,previous_balance+signed_value,p_expires_on,p_reversal_of,p_reversal_of,
    p_overtime_review_id,p_payroll_item_id,p_request_id,coalesce(p_rule_snapshot,'{}'::jsonb),
    (select au.id from public.admin_users au where au.tenant_id=p_tenant_id and au.auth_user_id=p_created_by limit 1),
    p_approved_by,
    case when p_approved_by is not null then now() else null end,case when p_approved_by is null then 'pending' else 'approved' end
  ) returning * into movement;

  insert into public.audit_logs(tenant_id,user_email,action,entity,entity_id,reason,new_data)
  values(
    p_tenant_id,
    coalesce((select email from auth.users where id=p_created_by),'system'),
    'append_hour_bank_movement_v51',
    'hour_bank_movements',
    movement.id::text,
    trim(p_reason),
    jsonb_build_object('employee_id',p_employee_id,'branch_id',p_branch_id,'movement_type',p_movement_type,'minutes',p_minutes,'balance_before',previous_balance,'balance_after',previous_balance+signed_value,'origin',p_origin)
  );

  return movement;
end $$;

revoke all on function public.append_hour_bank_movement_v51(uuid,uuid,uuid,date,integer,text,text,text,text,uuid,uuid,date,uuid,uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.append_hour_bank_movement_v51(uuid,uuid,uuid,date,integer,text,text,text,text,uuid,uuid,date,uuid,uuid,uuid,uuid,jsonb) to service_role;

create or replace function public.reverse_hour_bank_movement_v51(
  p_tenant_id uuid,
  p_movement_id uuid,
  p_reason text,
  p_idempotency_key text,
  p_created_by uuid
)
returns public.hour_bank_movements
language plpgsql security definer set search_path=public
as $$
declare
  original public.hour_bank_movements%rowtype;
  reverse_type text;
begin
  select * into original from public.hour_bank_movements
   where id=p_movement_id and tenant_id=p_tenant_id for update;
  if not found then raise exception 'MOVEMENT_NOT_FOUND'; end if;
  if original.status='reversed' or exists(select 1 from public.hour_bank_movements where tenant_id=p_tenant_id and reversal_of=original.id) then raise exception 'ALREADY_REVERSED'; end if;
  reverse_type := case when original.movement_type in ('debit','compensation') then 'credit' else 'debit' end;
  return public.append_hour_bank_movement_v51(
    p_tenant_id,original.employee_id,original.branch_id,current_date,original.minutes,reverse_type,
    'reversal',p_reason,p_idempotency_key,p_created_by,p_created_by,null,original.id,null,null,null,
    jsonb_build_object('reversed_movement_id',original.id,'original_type',original.movement_type)
  );
end $$;

revoke all on function public.reverse_hour_bank_movement_v51(uuid,uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.reverse_hour_bank_movement_v51(uuid,uuid,text,text,uuid) to service_role;

create trigger trg_hour_bank_immutable_update before update or delete on public.hour_bank_movements
for each row execute function public.prevent_hour_bank_mutation();

comment on column public.hour_bank_movements.minutes is 'Valor absoluto positivo. O sinal é definido por movement_type.';
