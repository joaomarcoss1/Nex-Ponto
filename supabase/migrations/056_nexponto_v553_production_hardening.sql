-- NexPonto v5.5.3 — integridade multitenant, overtime e jobs.
-- Incremental, fail-safe, não destrutiva e reexecutável.

begin;

-- Falhar antes das constraints quando houver vínculo ambíguo. A correção deve
-- ser administrativa e auditada; esta migration nunca promove nem exclui.
do $$
begin
  if exists (
    select 1 from public.tenant_memberships tm
    join public.admin_users au on au.id=tm.admin_user_id
    where tm.admin_user_id is not null
      and (au.tenant_id is distinct from tm.tenant_id or au.auth_user_id is distinct from tm.auth_user_id)
  ) then
    raise exception 'PRECHECK_ADMIN_MEMBERSHIP_IDENTITY_MISMATCH';
  end if;
  if exists (
    select 1 from public.hour_bank_movements
    where overtime_review_id is not null and origin='approved_overtime'
    group by tenant_id,overtime_review_id having count(*)>1
  ) then
    raise exception 'PRECHECK_DUPLICATE_OVERTIME_CREDITS';
  end if;
end $$;

-- Identidade administrativa composta.
do $$
begin
  if not exists(select 1 from pg_constraint where conname='uq_admin_users_identity_v553') then
    alter table public.admin_users
      add constraint uq_admin_users_identity_v553 unique(id,tenant_id,auth_user_id);
  end if;
  if not exists(select 1 from pg_constraint where conname='fk_membership_admin_identity_v553') then
    alter table public.tenant_memberships
      add constraint fk_membership_admin_identity_v553
      foreign key(admin_user_id,tenant_id,auth_user_id)
      references public.admin_users(id,tenant_id,auth_user_id)
      on delete restrict not valid;
  end if;
end $$;
alter table public.tenant_memberships validate constraint fk_membership_admin_identity_v553;

-- tenant_id é imutável em atualizações comuns. Operações futuras de migração
-- entre empresas devem usar fluxo privilegiado específico, nunca UPDATE.
create or replace function public.prevent_tenant_id_mutation_v553()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if new.tenant_id is distinct from old.tenant_id then
    raise exception 'TENANT_MUTATION_FORBIDDEN' using errcode='42501';
  end if;
  return new;
end $$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'admin_users','tenant_memberships','branches','employees','time_entries',
    'work_sessions','overtime_reviews','hour_bank_movements','payroll_periods',
    'payroll_items','payroll_calculation_runs','report_exports','background_jobs'
  ] loop
    if to_regclass('public.'||table_name) is not null then
      execute format('drop trigger if exists trg_tenant_immutable_v553 on public.%I',table_name);
      execute format('create trigger trg_tenant_immutable_v553 before update of tenant_id on public.%I for each row execute function public.prevent_tenant_id_mutation_v553()',table_name);
    end if;
  end loop;
end $$;

-- IP de tentativas de PIN passa a ser pseudonimizado na aplicação.
alter table public.pin_attempt_logs add column if not exists ip_hash text;
create index if not exists idx_pin_attempt_logs_ip_hash_v553
  on public.pin_attempt_logs(tenant_id,ip_hash,created_at desc)
  where ip_hash is not null;

alter table public.absence_justifications drop constraint if exists absence_attachment_scan_status_v52;
alter table public.absence_justifications
  add constraint absence_attachment_scan_status_v52
  check(attachment_scan_status in ('not_required','pending','clean','infected','failed','scanner_unavailable','rejected','error')) not valid;
alter table public.absence_justifications validate constraint absence_attachment_scan_status_v52;

-- Uma revisão pode originar no máximo um crédito de hora extra. Duplicidades
-- históricas são bloqueadas pelo precheck, sem apagar informação financeira.
create unique index if not exists uq_hour_bank_overtime_review_v553
  on public.hour_bank_movements(tenant_id,overtime_review_id)
  where overtime_review_id is not null and origin='approved_overtime';

create or replace function public.approve_overtime_v51(
  p_tenant_id uuid,p_review_id uuid,p_status text,p_minutes integer,p_percentage numeric,p_approved_amount numeric,
  p_destination text,p_payment_minutes integer,p_bank_minutes integer,p_category text,p_reason text,p_actor uuid,p_idempotency_key text
)
returns public.overtime_reviews
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  review public.overtime_reviews%rowtype;
  existing_credit public.hour_bank_movements%rowtype;
  bank_key text;
  old_bank integer;
  desired_bank integer;
  bank_delta integer;
  transition_token text;
begin
  if p_status not in ('approved','adjusted','rejected') then raise exception 'INVALID_OVERTIME_STATUS'; end if;
  if p_status in ('approved','adjusted') and (p_minutes<0 or p_payment_minutes<0 or p_bank_minutes<0 or p_minutes<>p_payment_minutes+p_bank_minutes) then raise exception 'OVERTIME_MINUTES_MISMATCH'; end if;
  if p_destination not in ('payment','hour_bank','split') then raise exception 'INVALID_OVERTIME_DESTINATION'; end if;
  if p_status='adjusted' and length(trim(coalesce(p_reason,'')))<5 then raise exception 'OVERTIME_ADJUSTMENT_REASON_REQUIRED'; end if;

  select * into review from public.overtime_reviews
    where id=p_review_id and tenant_id=p_tenant_id for update;
  if not found then raise exception 'OVERTIME_REVIEW_NOT_FOUND'; end if;
  if exists(select 1 from public.payroll_periods pp where pp.tenant_id=p_tenant_id and (pp.branch_id is null or pp.branch_id=review.branch_id) and review.entry_date between pp.start_date and pp.end_date and pp.status::text in ('closed','closed_with_exceptions','paid')) then raise exception 'CLOSED_PERIOD'; end if;

  select * into existing_credit from public.hour_bank_movements
    where tenant_id=p_tenant_id and overtime_review_id=p_review_id and origin='approved_overtime'
    for update;
  old_bank:=case when review.status::text in ('approved','adjusted') then coalesce(review.bank_minutes,0) else 0 end;
  desired_bank:=case when p_status in ('approved','adjusted') then p_bank_minutes else 0 end;
  bank_delta:=desired_bank-old_bank;
  transition_token:=coalesce(extract(epoch from review.reviewed_at)::bigint::text,'initial');
  if old_bank>0 and existing_credit.id is null then
    raise exception 'OVERTIME_CREDIT_LEDGER_MISMATCH';
  end if;

  update public.overtime_reviews set
    status=p_status::justification_status,
    approved_overtime_minutes=case when p_status='rejected' then 0 else p_minutes end,
    approved_percentage=p_percentage,
    approved_amount=case when p_status='rejected' then 0 else p_approved_amount end,
    overtime_amount=case when p_status='rejected' then 0 when p_approved_amount is null then overtime_amount else p_approved_amount end,
    destination=p_destination,
    payment_minutes=case when p_status='rejected' then 0 else p_payment_minutes end,
    bank_minutes=case when p_status='rejected' then 0 else p_bank_minutes end,
    category=p_category,adjustment_reason=p_reason,reviewed_observation=p_reason,
    reviewed_by=p_actor,reviewed_at=now(),idempotency_key=p_idempotency_key,
    rule_snapshot=jsonb_build_object('percentage',p_percentage,'destination',p_destination,'category',p_category,'approved_at',now(),'manual_amount',p_approved_amount is not null)
  where id=p_review_id returning * into review;

  if desired_bank>0 and existing_credit.id is null then
    bank_key:=p_tenant_id::text||':overtime:'||p_review_id::text||':bank';
    perform public.append_hour_bank_movement_v51(p_tenant_id,review.employee_id,review.branch_id,review.entry_date,desired_bank,'credit','approved_overtime','Crédito de hora extra aprovada',bank_key,p_actor,p_actor,null,null,review.id,null,null,review.rule_snapshot);
  elsif existing_credit.id is not null and bank_delta<>0 then
    bank_key:=p_tenant_id::text||':overtime:'||p_review_id::text||':adjust:'||transition_token||':'||old_bank::text||':'||desired_bank::text;
    perform public.append_hour_bank_movement_v51(
      p_tenant_id,review.employee_id,review.branch_id,review.entry_date,abs(bank_delta),
      case when bank_delta>0 then 'credit' else 'debit' end,
      'overtime_adjustment','Ajuste transacional de hora extra aprovada',bank_key,
      p_actor,p_actor,null,null,null,null,null,
      review.rule_snapshot||jsonb_build_object('overtime_review_id',review.id,'bank_minutes_before',old_bank,'bank_minutes_after',desired_bank)
    );
  end if;
  return review;
end $$;
revoke all on function public.approve_overtime_v51(uuid,uuid,text,integer,numeric,numeric,text,integer,integer,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.approve_overtime_v51(uuid,uuid,text,integer,numeric,numeric,text,integer,integer,text,text,uuid,text) to service_role;

-- Heartbeat e conclusão atômica com verificação de lease/worker e evento.
create or replace function public.heartbeat_background_job_v553(p_job_id uuid,p_worker_id text)
returns public.background_jobs language plpgsql security definer set search_path=public,pg_temp as $$
declare job public.background_jobs%rowtype;
begin
  update public.background_jobs set last_heartbeat_at=now(),lease_expires_at=now()+interval '5 minutes',updated_at=now()
   where id=p_job_id and status='running' and worker_id=p_worker_id and lease_expires_at>now()
   returning * into job;
  if not found then raise exception 'JOB_LEASE_LOST'; end if;
  return job;
end $$;

create or replace function public.complete_background_job_v553(p_job_id uuid,p_worker_id text,p_result jsonb)
returns public.background_jobs language plpgsql security definer set search_path=public,pg_temp as $$
declare job public.background_jobs%rowtype;
begin
  update public.background_jobs set status='completed',progress=100,completed_at=now(),
    result=coalesce(p_result,'{}'::jsonb),lease_expires_at=null,last_heartbeat_at=now(),updated_at=now()
   where id=p_job_id and status='running' and worker_id=p_worker_id and lease_expires_at>now()
   returning * into job;
  if not found then raise exception 'JOB_LEASE_LOST'; end if;
  insert into public.background_job_events(tenant_id,job_id,event_type,details)
    values(job.tenant_id,job.id,'completed',jsonb_build_object('worker_id',p_worker_id,'attempt',job.attempts));
  return job;
end $$;
revoke all on function public.heartbeat_background_job_v553(uuid,text) from public,anon,authenticated;
revoke all on function public.complete_background_job_v553(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.heartbeat_background_job_v553(uuid,text) to service_role;
grant execute on function public.complete_background_job_v553(uuid,text,jsonb) to service_role;

insert into public.nexponto_schema_versions(version,notes)
values('5.5.3','Hardening multitenant, RBAC, paginação, overtime idempotente e executor de jobs')
on conflict(version) do nothing;

commit;
