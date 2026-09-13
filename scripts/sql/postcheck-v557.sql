-- Execute depois da migration 060. Qualquer FAIL bloqueia a promoção para produção.
with checks(check_name, passed, details) as (
  select 'schema_version_5_5_7',
         exists(select 1 from public.nexponto_schema_versions where version='5.5.7'),
         'migration 060 registrada'
  union all
  select 'critical_admin_functions',
         to_regproc('public.count_effective_master_admins_v557') is not null
         and to_regproc('public.upsert_tenant_admin_v557') is not null
         and to_regproc('public.rollback_tenant_admin_creation_v557') is not null
         and to_regproc('public.restore_tenant_admin_snapshot_v557') is not null
         and to_regproc('public.reconcile_admin_memberships_v557') is not null,
         'RPCs de sincronização e compensação disponíveis'
  union all
  select 'effective_master_per_operational_tenant',
         not exists(
           select 1 from public.tenants tenant
           where tenant.status in ('trial','active','onboarding','pending_validation')
             and exists(select 1 from public.admin_users au where au.tenant_id=tenant.id)
             and public.count_effective_master_admins_v557(tenant.id,null)<1
         ),
         'todo tenant operacional com admins possui Master efetivo'
  union all
  select 'identity_role_active_drift_absent',
         not exists(
           select 1 from public.admin_users au join public.tenant_memberships tm on tm.admin_user_id=au.id
           where tm.tenant_id<>au.tenant_id or tm.auth_user_id<>au.auth_user_id
              or tm.role<>au.role::text or tm.active is distinct from au.active
         ),
         'identidade, role, tenant e active sincronizados'
  union all
  select 'branch_drift_absent',
         not exists(
           select 1 from public.admin_users au join public.tenant_memberships tm on tm.admin_user_id=au.id
           where not public.uuid_array_set_equal_v557(au.allowed_branch_ids,tm.branch_ids)
         ),
         'filiais sincronizadas sem união permissiva'
  union all
  select 'mfa_operationally_disabled',
         not exists(select 1 from public.platform_superadmins where mfa_required),
         'login permanece e-mail + senha'
  union all
  select 'security_definer_search_path',
         not exists(
           select 1 from pg_proc procedure
           join pg_namespace namespace on namespace.oid=procedure.pronamespace
           where namespace.nspname='public' and procedure.prosecdef
             and coalesce(array_to_string(procedure.proconfig,','),'') not like '%search_path=%'
         ),
         'todas as SECURITY DEFINER públicas possuem search_path explícito'
  union all
  select 'jobs_lease_contract_present',
         to_regproc('public.claim_background_job_v556') is not null
         and to_regproc('public.heartbeat_background_job_v556') is not null
         and to_regproc('public.complete_background_job_v556') is not null
         and to_regproc('public.fail_background_job_v556') is not null,
         'executor usa lease token por claim'
)
select check_name, case when passed then 'PASS' else 'FAIL' end status, details
from checks
order by check_name;
