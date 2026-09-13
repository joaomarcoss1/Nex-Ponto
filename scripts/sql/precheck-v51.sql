-- NexPonto v5.1 — execute ANTES das migrations 031–044 e exporte o resultado.
create extension if not exists pgcrypto;
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

with tenant_metrics as (
  select t.id as tenant_id,jsonb_build_object(
    'tenant_id',t.id,
    'branches',(select count(*) from public.branches b where b.tenant_id=t.id),
    'employees',(select count(*) from public.employees e where e.tenant_id=t.id),
    'salary_history',(select count(*) from public.employee_salary_history sh where sh.tenant_id=t.id),
    'salary_sum',(select coalesce(sum(e.monthly_salary),0) from public.employees e where e.tenant_id=t.id),
    'time_entries',(select count(*) from public.time_entries te where te.tenant_id=t.id),
    'work_sessions',(select count(*) from public.work_sessions ws where ws.tenant_id=t.id),
    'schedules',(select count(*) from public.work_schedules sc where sc.tenant_id=t.id),
    'hour_bank_signed_balance',(select coalesce(sum(h.minutes),0) from public.hour_bank_movements h where h.tenant_id=t.id),
    'payroll_periods',(select count(*) from public.payroll_periods pp where pp.tenant_id=t.id),
    'payroll_items',(select count(*) from public.payroll_items pi where pi.tenant_id=t.id),
    'coordinates_signature',(select encode(digest(coalesce(string_agg(b.id::text||':'||coalesce(b.latitude::text,'')||':'||coalesce(b.longitude::text,''),'|' order by b.id),'empty'),'sha256'),'hex') from public.branches b where b.tenant_id=t.id),
    'employee_signature',(select encode(digest(coalesce(string_agg(e.id::text||':'||coalesce(e.registration_code,'')||':'||coalesce(e.pin_hash,''),'|' order by e.id),'empty'),'sha256'),'hex') from public.employees e where e.tenant_id=t.id)
  ) as metrics
  from public.tenants t
)
insert into public.migration_integrity_snapshots(migration_key,phase,tenant_id,metrics,checksum)
select 'nexponto_v51','pre',tenant_id,metrics,encode(digest(metrics::text,'sha256'),'hex')
from tenant_metrics
on conflict(migration_key,phase,tenant_id) do update
set metrics=excluded.metrics,checksum=excluded.checksum,created_at=now();

select tenant_id,metrics,checksum,created_at
from public.migration_integrity_snapshots
where migration_key='nexponto_v51' and phase='pre'
order by tenant_id;
