-- Execute em homologação antes das migrations 049-052.
begin;
select count(*) as tenants from public.tenants;
select count(*) as time_entries_without_tenant from public.time_entries where tenant_id is null;
select tenant_id,idempotency_key,count(*)
from public.background_jobs
group by tenant_id,idempotency_key
having count(*)>1;
select tenant_id,device_key_hash,count(*)
from public.authorized_devices
group by tenant_id,device_key_hash
having count(*)>1;
select id,status,created_by
from public.payroll_calculation_runs
where status in ('hr_approved','financial_approved','closed','closed_with_exceptions','exported','paid')
order by updated_at desc
limit 100;
rollback;
