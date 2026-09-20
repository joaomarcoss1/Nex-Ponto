-- NexPonto v5.3 - NSR por empresa, recibo de marcação e ajustes sem sobrescrita.

alter table public.time_entries
  add column if not exists nsr bigint,
  add column if not exists regulatory_hash text,
  add column if not exists collector_id text not null default 'nexponto-web',
  add column if not exists recorded_at timestamptz not null default now();

with numbered as (
  select id,row_number() over(
    partition by tenant_id order by entry_timestamp,created_at,id
  )::bigint as generated_nsr
  from public.time_entries
  where nsr is null
)
update public.time_entries entry
set nsr=numbered.generated_nsr
from numbered
where entry.id=numbered.id;

update public.time_entries
set regulatory_hash=encode(
  digest(
    tenant_id::text||id::text||employee_id::text||branch_id::text||
    action::text||entry_timestamp::text||nsr::text,
    'sha256'
  ),
  'hex'
)
where regulatory_hash is null;

create table if not exists public.tenant_nsr_counters (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  current_nsr bigint not null default 0 check(current_nsr>=0),
  updated_at timestamptz not null default now()
);
insert into public.tenant_nsr_counters(tenant_id,current_nsr)
select t.id,coalesce(max(e.nsr),0)
from public.tenants t
left join public.time_entries e on e.tenant_id=t.id
group by t.id
on conflict(tenant_id) do update
set current_nsr=greatest(public.tenant_nsr_counters.current_nsr,excluded.current_nsr),
    updated_at=now();

create or replace function public.assign_time_entry_regulatory_v53()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.nsr is null then
    insert into public.tenant_nsr_counters(tenant_id,current_nsr)
    values(new.tenant_id,1)
    on conflict(tenant_id) do update
      set current_nsr=public.tenant_nsr_counters.current_nsr+1,updated_at=now()
    returning current_nsr into new.nsr;
  end if;
  new.recorded_at:=coalesce(new.recorded_at,clock_timestamp());
  new.collector_id:=coalesce(nullif(new.collector_id,''),'nexponto-web');
  new.regulatory_hash:=encode(
    digest(
      new.tenant_id::text||new.id::text||new.employee_id::text||new.branch_id::text||
      new.action::text||new.entry_timestamp::text||new.nsr::text,
      'sha256'
    ),
    'hex'
  );
  return new;
end $$;
drop trigger if exists trg_time_entry_regulatory_v53 on public.time_entries;
create trigger trg_time_entry_regulatory_v53
before insert on public.time_entries
for each row execute function public.assign_time_entry_regulatory_v53();

alter table public.time_entries alter column nsr set not null;
alter table public.time_entries alter column regulatory_hash set not null;
create unique index if not exists uq_time_entries_tenant_nsr_v53
  on public.time_entries(tenant_id,nsr);

create table if not exists public.time_clock_receipts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  time_entry_id uuid not null references public.time_entries(id) on delete restrict,
  nsr bigint not null,
  receipt_hash text not null,
  payload jsonb not null,
  signature_format text not null default 'sha256'
    check(signature_format in ('sha256','cades_icp_brasil')),
  signature_status text not null default 'integrity_only'
    check(signature_status in ('integrity_only','signed','invalid','revoked')),
  signature_metadata jsonb not null default '{}'::jsonb,
  issued_at timestamptz not null default now(),
  unique(time_entry_id),
  unique(tenant_id,nsr)
);

create or replace function public.create_time_clock_receipt_v53()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  receipt_payload jsonb;
  timezone_value text;
begin
  select timezone into timezone_value
  from public.work_sessions
  where id=new.work_session_id;
  receipt_payload:=jsonb_build_object(
    'time_entry_id',new.id,
    'tenant_id',new.tenant_id,
    'employee_id',new.employee_id,
    'branch_id',new.branch_id,
    'action',new.action,
    'entry_timestamp',new.entry_timestamp,
    'timezone',coalesce(timezone_value,'America/Sao_Paulo'),
    'nsr',new.nsr,
    'collector_id',new.collector_id,
    'regulatory_hash',new.regulatory_hash
  );
  insert into public.time_clock_receipts(
    tenant_id,time_entry_id,nsr,receipt_hash,payload
  ) values(
    new.tenant_id,new.id,new.nsr,
    encode(digest(receipt_payload::text,'sha256'),'hex'),
    receipt_payload
  ) on conflict(time_entry_id) do nothing;
  return new;
end $$;
drop trigger if exists trg_time_clock_receipt_v53 on public.time_entries;
create trigger trg_time_clock_receipt_v53
after insert on public.time_entries
for each row execute function public.create_time_clock_receipt_v53();

insert into public.time_clock_receipts(tenant_id,time_entry_id,nsr,receipt_hash,payload)
select
  e.tenant_id,e.id,e.nsr,
  encode(digest(payload.value::text,'sha256'),'hex'),
  payload.value
from public.time_entries e
left join public.work_sessions session on session.id=e.work_session_id
cross join lateral (
  select jsonb_build_object(
    'time_entry_id',e.id,'tenant_id',e.tenant_id,'employee_id',e.employee_id,
    'branch_id',e.branch_id,'action',e.action,'entry_timestamp',e.entry_timestamp,
    'timezone',coalesce(session.timezone,'America/Sao_Paulo'),'nsr',e.nsr,
    'collector_id',e.collector_id,'regulatory_hash',e.regulatory_hash
  ) value
) payload
on conflict(time_entry_id) do nothing;

create table if not exists public.time_entry_adjustments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  original_time_entry_id uuid not null references public.time_entries(id) on delete restrict,
  replacement_timestamp timestamptz,
  replacement_action text,
  decision text not null check(decision in ('approve','reject','replace','annotate')),
  reason text not null check(length(trim(reason))>=10),
  evidence jsonb not null default '{}'::jsonb,
  requested_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.time_clock_receipts enable row level security;
alter table public.time_entry_adjustments enable row level security;
revoke all on public.time_clock_receipts from public,anon,authenticated;
revoke all on public.time_entry_adjustments from public,anon,authenticated;
create policy time_receipts_admin_read on public.time_clock_receipts
  for select to authenticated
  using(
    tenant_id=public.current_tenant_id()
    and (public.is_tenant_admin_member(tenant_id) or public.has_tenant_role(tenant_id,array['auditor']))
  );
create policy time_adjustments_admin_read on public.time_entry_adjustments
  for select to authenticated
  using(
    tenant_id=public.current_tenant_id()
    and (public.is_tenant_admin_member(tenant_id) or public.has_tenant_role(tenant_id,array['auditor']))
  );

create index if not exists idx_time_receipts_tenant_issued_v53
  on public.time_clock_receipts(tenant_id,issued_at desc);
create index if not exists idx_time_adjustments_entry_v53
  on public.time_entry_adjustments(tenant_id,original_time_entry_id,created_at desc);

comment on table public.time_clock_receipts is
  'Comprovante imutável da marcação. SHA-256 está implementado; CAdES exige certificado ICP-Brasil externo.';
comment on table public.time_entry_adjustments is
  'Ajustes auditáveis vinculados ao registro original, sem apagar a marcação capturada.';
