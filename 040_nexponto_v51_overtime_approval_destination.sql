-- NexPonto v5.1 — aprovação profissional de horas extras e destino financeiro.

alter table public.overtime_reviews
  add column if not exists approved_percentage numeric(8,4) not null default 50,
  add column if not exists approved_amount numeric(14,2),
  add column if not exists destination text not null default 'payment' check(destination in ('payment','hour_bank','split')),
  add column if not exists payment_minutes integer not null default 0 check(payment_minutes>=0),
  add column if not exists bank_minutes integer not null default 0 check(bank_minutes>=0),
  add column if not exists category text not null default 'overtime_50',
  add column if not exists adjustment_reason text,
  add column if not exists rule_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists idempotency_key text;

update public.overtime_reviews
set payment_minutes=case when destination='payment' then approved_overtime_minutes else payment_minutes end,
    bank_minutes=case when destination='hour_bank' then approved_overtime_minutes else bank_minutes end,
    approved_amount=coalesce(approved_amount,overtime_amount)
where status::text in ('approved','adjusted');

alter table public.overtime_reviews drop constraint if exists overtime_destination_minutes_v51;
alter table public.overtime_reviews add constraint overtime_destination_minutes_v51 check(
  approved_overtime_minutes = payment_minutes + bank_minutes
) not valid;

create unique index if not exists uq_overtime_tenant_idempotency_v51 on public.overtime_reviews(tenant_id,idempotency_key) where idempotency_key is not null;

create or replace function public.approve_overtime_v51(
  p_tenant_id uuid,p_review_id uuid,p_status text,p_minutes integer,p_percentage numeric,p_approved_amount numeric,
  p_destination text,p_payment_minutes integer,p_bank_minutes integer,p_category text,p_reason text,p_actor uuid,p_idempotency_key text
)
returns public.overtime_reviews
language plpgsql security definer set search_path=public as $$
declare review public.overtime_reviews%rowtype; bank_key text;
begin
  if p_status not in ('approved','adjusted','rejected') then raise exception 'INVALID_OVERTIME_STATUS'; end if;
  if p_status in ('approved','adjusted') and (p_minutes<0 or p_payment_minutes<0 or p_bank_minutes<0 or p_minutes<>p_payment_minutes+p_bank_minutes) then raise exception 'OVERTIME_MINUTES_MISMATCH'; end if;
  if p_destination not in ('payment','hour_bank','split') then raise exception 'INVALID_OVERTIME_DESTINATION'; end if;
  if p_status='adjusted' and length(trim(coalesce(p_reason,'')))<5 then raise exception 'OVERTIME_ADJUSTMENT_REASON_REQUIRED'; end if;
  select * into review from public.overtime_reviews where id=p_review_id and tenant_id=p_tenant_id for update;
  if not found then raise exception 'OVERTIME_REVIEW_NOT_FOUND'; end if;
  if exists(select 1 from public.payroll_periods pp where pp.tenant_id=p_tenant_id and (pp.branch_id is null or pp.branch_id=review.branch_id) and review.entry_date between pp.start_date and pp.end_date and pp.status::text in ('closed','closed_with_exceptions','paid')) then raise exception 'CLOSED_PERIOD'; end if;

  update public.overtime_reviews set
    status=p_status::justification_status,
    approved_overtime_minutes=case when p_status='rejected' then 0 else p_minutes end,
    approved_percentage=p_percentage,
    approved_amount=case when p_status='rejected' then 0 else p_approved_amount end,
    overtime_amount=case when p_status='rejected' then 0 else p_approved_amount end,
    destination=p_destination,
    payment_minutes=case when p_status='rejected' then 0 else p_payment_minutes end,
    bank_minutes=case when p_status='rejected' then 0 else p_bank_minutes end,
    category=p_category,
    adjustment_reason=p_reason,
    reviewed_observation=p_reason,
    reviewed_by=p_actor,reviewed_at=now(),idempotency_key=p_idempotency_key,
    rule_snapshot=jsonb_build_object('percentage',p_percentage,'destination',p_destination,'category',p_category,'approved_at',now())
  where id=p_review_id returning * into review;

  if p_status in ('approved','adjusted') and p_bank_minutes>0 then
    bank_key:=p_idempotency_key||':bank';
    perform public.append_hour_bank_movement_v51(p_tenant_id,review.employee_id,review.branch_id,review.entry_date,p_bank_minutes,'credit','approved_overtime','Crédito de hora extra aprovada',bank_key,p_actor,p_actor,null,null,review.id,null,null,review.rule_snapshot);
  end if;
  return review;
end $$;
revoke all on function public.approve_overtime_v51(uuid,uuid,text,integer,numeric,numeric,text,integer,integer,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.approve_overtime_v51(uuid,uuid,text,integer,numeric,numeric,text,integer,integer,text,text,uuid,text) to service_role;
