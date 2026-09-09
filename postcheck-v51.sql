-- NexPonto v5.1 — execute APÓS as migrations 031–044.
select public.save_integrity_snapshot_v51('nexponto_v51','post',t.id)
from public.tenants t order by t.id;

with pre as (
  select tenant_id,metrics,checksum from public.migration_integrity_snapshots where migration_key='nexponto_v51' and phase='pre'
), post as (
  select tenant_id,metrics,checksum from public.migration_integrity_snapshots where migration_key='nexponto_v51' and phase='post'
)
select pre.tenant_id,
  pre.metrics as pre_metrics,
  post.metrics as post_metrics,
  (pre.metrics->>'branches')=(post.metrics->>'branches') as branches_preserved,
  (pre.metrics->>'employees')=(post.metrics->>'employees') as employees_preserved,
  (pre.metrics->>'salary_history')=(post.metrics->>'salary_history') as salary_history_preserved,
  (pre.metrics->>'salary_sum')=(post.metrics->>'salary_sum') as salary_sum_preserved,
  (pre.metrics->>'time_entries')=(post.metrics->>'time_entries') as time_entries_preserved,
  (pre.metrics->>'work_sessions')=(post.metrics->>'work_sessions') as work_sessions_preserved,
  (pre.metrics->>'schedules')=(post.metrics->>'schedules') as schedules_preserved,
  (pre.metrics->>'hour_bank_signed_balance')=(post.metrics->>'hour_bank_signed_balance') as hour_bank_balance_preserved,
  (pre.metrics->>'payroll_periods')=(post.metrics->>'payroll_periods') as payroll_periods_preserved,
  (pre.metrics->>'payroll_items')=(post.metrics->>'payroll_items') as payroll_items_preserved,
  (pre.metrics->>'coordinates_signature')=(post.metrics->>'coordinates_signature') as coordinates_preserved,
  (pre.metrics->>'employee_signature')=(post.metrics->>'employee_signature') as employees_signature_preserved
from pre join post using(tenant_id)
order by pre.tenant_id;
