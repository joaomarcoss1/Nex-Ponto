-- NexPonto v5.5.4 precheck. Somente leitura; todas as linhas devem retornar failures=0.
select 'ADMIN_MEMBERSHIP_IDENTITY_MISMATCH' as check_name,count(*) as failures
from public.tenant_memberships tm join public.admin_users au on au.id=tm.admin_user_id
where tm.admin_user_id is not null
  and (au.tenant_id is distinct from tm.tenant_id or au.auth_user_id is distinct from tm.auth_user_id)
union all
select 'ACTIVE_MEMBERSHIP_WITH_INACTIVE_TENANT',count(*)
from public.tenant_memberships tm join public.tenants t on t.id=tm.tenant_id
where tm.active and t.status not in ('trial','active')
union all
select 'EMPLOYEE_BRANCH_TENANT_MISMATCH',count(*)
from public.employees e join public.branches b on b.id=e.branch_id
where e.tenant_id is distinct from b.tenant_id
union all
select 'DUPLICATE_OVERTIME_CREDITS',count(*)
from (select tenant_id,overtime_review_id from public.hour_bank_movements
      where overtime_review_id is not null and origin='approved_overtime'
      group by tenant_id,overtime_review_id having count(*)>1) duplicates
union all
select 'EXHAUSTED_JOB_STILL_RUNNING',count(*)
from public.background_jobs where status='running' and lease_expires_at<=now() and attempts>=max_attempts
union all
select 'MISSING_V553_PREREQUISITES',case when
  to_regprocedure('public.heartbeat_background_job_v553(uuid,text)') is null
  or to_regprocedure('public.complete_background_job_v553(uuid,text,jsonb)') is null
  or not exists(select 1 from public.nexponto_schema_versions where version='5.5.3')
then 1 else 0 end;
