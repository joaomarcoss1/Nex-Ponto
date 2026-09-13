-- Execute com uma role de manutenção antes da migration 060.
with checks(check_name, passed, details) as (
  select 'master_chain_present',
         exists(
           select 1 from public.admin_users au
           join public.tenant_memberships tm
             on tm.admin_user_id=au.id and tm.auth_user_id=au.auth_user_id and tm.tenant_id=au.tenant_id
           join auth.users u on u.id=au.auth_user_id and u.deleted_at is null
           join public.tenants t on t.id=au.tenant_id
           where au.active and tm.active and au.role::text in ('tenant_owner','master_admin')
             and tm.role=au.role::text and t.status not in ('suspended','cancelled','archived')
         ),
         'auth.users -> admin_users -> tenant_memberships -> tenants'
  union all
  select 'role_drift_absent',
         not exists(
           select 1 from public.admin_users au join public.tenant_memberships tm on tm.admin_user_id=au.id
           where tm.tenant_id<>au.tenant_id or tm.auth_user_id<>au.auth_user_id or tm.role<>au.role::text
         ),
         'admin_users.role deve coincidir com tenant_memberships.role'
  union all
  select 'branch_drift_absent',
         not exists(
           select 1 from public.admin_users au join public.tenant_memberships tm on tm.admin_user_id=au.id
           where coalesce((select array_agg(value order by value) from (select distinct unnest(coalesce(au.allowed_branch_ids,'{}'::uuid[])) value) a),'{}'::uuid[])
              <> coalesce((select array_agg(value order by value) from (select distinct unnest(coalesce(tm.branch_ids,'{}'::uuid[])) value) m),'{}'::uuid[])
         ),
         'escopos divergentes exigem decisão conservadora antes do deploy'
  union all
  select 'active_drift_absent',
         not exists(
           select 1 from public.admin_users au join public.tenant_memberships tm on tm.admin_user_id=au.id
           where au.active is distinct from tm.active
         ),
         'active deve estar sincronizado'
  union all
  select 'tenant_mismatch_absent',
         not exists(
           select 1 from public.admin_users au join public.tenant_memberships tm on tm.admin_user_id=au.id
           where au.tenant_id<>tm.tenant_id
         ),
         'nenhum vínculo cross-tenant'
  union all
  select 'mfa_operationally_disabled',
         not exists(select 1 from public.platform_superadmins where mfa_required),
         'mfa_required deve permanecer false'
  union all
  select 'receipt_contract_present',
         to_regproc('public.register_time_entry_v4') is not null,
         'RPC de ponto/recibo existente'
  union all
  select 'jobs_lease_contract_present',
         to_regproc('public.claim_background_job_v556') is not null
         and to_regproc('public.heartbeat_background_job_v556') is not null
         and to_regproc('public.complete_background_job_v556') is not null
         and to_regproc('public.fail_background_job_v556') is not null,
         'claim/heartbeat/complete/fail com lease token'
)
select check_name, case when passed then 'PASS' else 'FAIL' end status, details
from checks
order by check_name;
