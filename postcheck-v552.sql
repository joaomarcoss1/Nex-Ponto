-- Execute com service_role após a migration 055.
-- Opcional: SET app.settings.master_admin_email = 'master@empresa.com';
with checks as (
  select 'schema_v552'::text as check_name,
    exists(select 1 from public.nexponto_schema_versions where version='5.5.2') as passed,
    'migration v5.5.2 registrada'::text as detail
  union all
  select 'canonical_permission',to_regprocedure('public.has_tenant_permission(uuid,text)') is not null,'API canônica de permissão'
  union all
  select 'reconciliation_rpc',to_regprocedure('public.reconcile_admin_memberships_v55()') is not null,'reconciliação administrativa'
  union all
  select 'employee_idempotency_rpc',to_regprocedure('public.upsert_employee_v552(uuid,uuid,jsonb,text,date,date,text,uuid,uuid,uuid)') is not null,'cadastro idempotente de funcionário'
  union all
  select 'master_chain',exists(
    select 1
    from auth.users u
    join public.admin_users a on a.auth_user_id=u.id and a.active
    join public.tenant_memberships tm on tm.auth_user_id=u.id and tm.admin_user_id=a.id and tm.tenant_id=a.tenant_id and tm.active
    join public.tenants t on t.id=tm.tenant_id and t.status in ('trial','active')
    where lower(u.email)=lower(current_setting('app.settings.master_admin_email',true))
  ),'auth -> admin -> membership -> tenant coerente'
  union all
  select 'exports_bucket',exists(select 1 from storage.buckets where id='exports' and not public),'bucket privado exports'
  union all
  select 'payroll_exports_bucket',exists(select 1 from storage.buckets where id='payroll-exports' and not public),'bucket privado payroll-exports'
  union all
  select 'mfa_disabled',not exists(select 1 from public.platform_superadmins where mfa_required),'segundo fator não obrigatório para platform admins'
  union all
  select 'admin_link_consistency',not exists(
    select 1 from public.tenant_memberships tm
    join public.admin_users a on a.id=tm.admin_user_id
    where tm.tenant_id is distinct from a.tenant_id or tm.auth_user_id is distinct from a.auth_user_id
  ),'links admin/membership sem divergência'
)
select check_name,case when passed then 'PASS' else 'FAIL' end as status,detail
from checks order by check_name;
