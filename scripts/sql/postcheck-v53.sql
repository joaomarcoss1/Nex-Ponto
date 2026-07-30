-- Execute após as migrations 049-052. Qualquer linha de duplicidade é bloqueador.
select count(*) as entries_without_nsr_or_hash
from public.time_entries
where nsr is null or regulatory_hash is null;
select tenant_id,nsr,count(*)
from public.time_entries
group by tenant_id,nsr
having count(*)>1;
select count(*) as entries_without_receipt
from public.time_entries e
left join public.time_clock_receipts r on r.time_entry_id=e.id
where r.id is null;
select e.tenant_id,count(*) as entries,max(e.nsr) as maximum_nsr,c.current_nsr
from public.time_entries e
join public.tenant_nsr_counters c on c.tenant_id=e.tenant_id
group by e.tenant_id,c.current_nsr
having max(e.nsr)>c.current_nsr;
select tablename,rowsecurity
from pg_tables
where schemaname='public'
  and tablename in (
    'clock_risk_events','time_clock_receipts','time_entry_adjustments',
    'payroll_state_transitions','background_job_events','privacy_requests',
    'tenant_lifecycle_requests'
  )
order by tablename;
select proname,prosecdef
from pg_proc
where proname in (
  'assign_time_entry_regulatory_v53','create_time_clock_receipt_v53',
  'claim_background_job_v53','fail_background_job_v53'
)
order by proname;
