-- Execute com credencial administrativa antes da migration 056. Não altera dados.
select 'ADMIN_MEMBERSHIP_IDENTITY_MISMATCH' as check_name,count(*) as failures
from public.tenant_memberships tm join public.admin_users au on au.id=tm.admin_user_id
where tm.admin_user_id is not null
  and (au.tenant_id is distinct from tm.tenant_id or au.auth_user_id is distinct from tm.auth_user_id)
union all
select 'EMPLOYEE_BRANCH_TENANT_MISMATCH',count(*)
from public.employees e join public.branches b on b.id=e.branch_id
where e.tenant_id is distinct from b.tenant_id
union all
select 'DUPLICATE_OVERTIME_CREDITS',count(*)
from (select tenant_id,overtime_review_id from public.hour_bank_movements
      where overtime_review_id is not null and origin='approved_overtime'
      group by tenant_id,overtime_review_id having count(*)>1) duplicates;

-- O operador deve considerar PASS somente quando todas as linhas retornarem 0.
