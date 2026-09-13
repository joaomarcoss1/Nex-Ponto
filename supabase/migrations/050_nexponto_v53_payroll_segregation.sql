-- NexPonto v5.3 - segregação obrigatória e trilha de transições da pré-folha.

create table if not exists public.payroll_state_transitions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  calculation_run_id uuid not null references public.payroll_calculation_runs(id) on delete cascade,
  from_status text not null,
  to_status text not null,
  permission_used text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  reason text not null,
  before_hash text not null,
  after_hash text not null,
  created_at timestamptz not null default now()
);
alter table public.payroll_state_transitions enable row level security;
revoke all on public.payroll_state_transitions from public,anon,authenticated;
create policy payroll_transitions_tenant_read on public.payroll_state_transitions
  for select to authenticated
  using(
    tenant_id=public.current_tenant_id()
    and (public.is_tenant_admin_member(tenant_id) or public.has_tenant_role(tenant_id,array['auditor']))
  );
create index if not exists idx_payroll_transitions_run_v53
  on public.payroll_state_transitions(tenant_id,calculation_run_id,created_at);

create or replace function public.transition_payroll_run_v51(
  p_tenant_id uuid,p_run_id uuid,p_target_status text,p_reason text,p_actor uuid
)
returns public.payroll_calculation_runs
language plpgsql security definer set search_path=public as $$
declare
  row_value public.payroll_calculation_runs%rowtype;
  prior_status text;
  unresolved_critical integer;
  accepted_critical integer;
  hr_actor uuid;
  financial_actor uuid;
  allowed boolean:=false;
  permission_used text;
  before_hash text;
  after_hash text;
begin
  if length(trim(coalesce(p_reason,'')))<10 then raise exception 'PAYROLL_TRANSITION_REASON_REQUIRED'; end if;
  select * into row_value
  from public.payroll_calculation_runs
  where id=p_run_id and tenant_id=p_tenant_id
  for update;
  if not found then raise exception 'PAYROLL_RUN_NOT_FOUND'; end if;

  prior_status:=row_value.status;
  if p_target_status='paid' then raise exception 'OFFICIAL_PAYROLL_DISABLED'; end if;
  allowed := (row_value.status='draft' and p_target_status in ('attendance_pending','calculated')) or
             (row_value.status='attendance_pending' and p_target_status='calculated') or
             (row_value.status='calculated' and p_target_status='checking') or
             (row_value.status='checking' and p_target_status='hr_approved') or
             (row_value.status='hr_approved' and p_target_status='financial_approved') or
             (row_value.status='financial_approved' and p_target_status in ('closed','closed_with_exceptions')) or
             (row_value.status in ('closed','closed_with_exceptions') and p_target_status='exported') or
             (row_value.status in ('closed','closed_with_exceptions','exported') and p_target_status='reopened') or
             (row_value.status='reopened' and p_target_status in ('attendance_pending','calculated','checking'));
  if not allowed then raise exception 'INVALID_PAYROLL_TRANSITION:%->%',row_value.status,p_target_status; end if;

  select approved_by into hr_actor
  from public.payroll_approvals
  where calculation_run_id=p_run_id and approval_stage='hr' and decision='approved'
  order by approved_at desc limit 1;
  select approved_by into financial_actor
  from public.payroll_approvals
  where calculation_run_id=p_run_id and approval_stage='financial' and decision='approved'
  order by approved_at desc limit 1;

  if p_target_status='hr_approved' and row_value.created_by=p_actor then
    raise exception 'SEGREGATION_CREATOR_CANNOT_HR_APPROVE';
  end if;
  if p_target_status='financial_approved' and (hr_actor is null or hr_actor=p_actor) then
    raise exception 'SEGREGATION_FINANCIAL_APPROVER_REQUIRED';
  end if;
  if p_target_status in ('closed','closed_with_exceptions') and
     (hr_actor is null or financial_actor is null or p_actor in (hr_actor,financial_actor)) then
    raise exception 'SEGREGATION_CLOSER_REQUIRED';
  end if;

  select count(*) filter(where status not in ('resolved','accepted_exception')),
         count(*) filter(where status='accepted_exception')
    into unresolved_critical,accepted_critical
  from public.payroll_divergences
  where tenant_id=p_tenant_id and calculation_run_id=p_run_id and severity='critical';
  if p_target_status='closed' and (unresolved_critical>0 or accepted_critical>0) then
    raise exception 'CRITICAL_DIVERGENCES_BLOCK_NORMAL_CLOSE';
  end if;
  if p_target_status='closed_with_exceptions' and (unresolved_critical>0 or accepted_critical=0) then
    raise exception 'CRITICAL_DIVERGENCES_REQUIRE_ACCEPTED_EXCEPTION';
  end if;

  before_hash:=encode(digest(row_value.id::text||row_value.version::text||row_value.status||row_value.summary::text,'sha256'),'hex');
  update public.payroll_calculation_runs
     set status=p_target_status,
         completed_at=case when p_target_status in ('calculated','closed','closed_with_exceptions') then now() else completed_at end,
         closed_at=case when p_target_status in ('closed','closed_with_exceptions') then now()
                        when p_target_status='reopened' then null else closed_at end,
         closed_by=case when p_target_status in ('closed','closed_with_exceptions') then p_actor
                        when p_target_status='reopened' then null else closed_by end,
         integrity_hash=case when p_target_status in ('closed','closed_with_exceptions','exported')
           then encode(digest(id::text||version::text||summary::text||p_target_status||now()::text,'sha256'),'hex')
           else integrity_hash end,
         updated_at=now()
   where id=p_run_id returning * into row_value;

  permission_used:=case
    when p_target_status='hr_approved' then 'payroll.hr_approve'
    when p_target_status='financial_approved' then 'payroll.financial_approve'
    when p_target_status in ('closed','closed_with_exceptions') then 'payroll.close'
    when p_target_status='exported' then 'payroll.export'
    when p_target_status='reopened' then 'payroll.reopen'
    else 'payroll.calculate' end;
  after_hash:=encode(digest(row_value.id::text||row_value.version::text||row_value.status||row_value.summary::text,'sha256'),'hex');

  if p_target_status in ('hr_approved','financial_approved','closed','closed_with_exceptions') then
    insert into public.payroll_approvals(tenant_id,calculation_run_id,approval_stage,decision,reason,approved_by)
    values(
      p_tenant_id,p_run_id,
      case when p_target_status='hr_approved' then 'hr'
           when p_target_status='financial_approved' then 'financial' else 'close' end,
      'approved',trim(p_reason),p_actor
    );
  end if;
  insert into public.payroll_state_transitions(
    tenant_id,calculation_run_id,from_status,to_status,permission_used,
    actor_user_id,reason,before_hash,after_hash
  ) values(
    p_tenant_id,p_run_id,prior_status,p_target_status,permission_used,
    p_actor,trim(p_reason),before_hash,after_hash
  );
  return row_value;
end $$;
revoke all on function public.transition_payroll_run_v51(uuid,uuid,text,text,uuid)
  from public,anon,authenticated;
grant execute on function public.transition_payroll_run_v51(uuid,uuid,text,text,uuid)
  to service_role;

comment on table public.payroll_state_transitions is
  'Ledger imutável das transições da pré-folha, com ator, permissão, motivo e hashes.';
