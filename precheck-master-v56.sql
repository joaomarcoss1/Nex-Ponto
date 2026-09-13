-- NexPonto v5.5.6 - precheck de login master/admin.
-- Execute com acesso a auth.users e informe o e-mail no cliente SQL:
--   set app.master_admin_email = 'admin@empresa.com';

with target_auth as (
  select id, lower(email) as email, email_confirmed_at
  from auth.users
  where lower(email)=lower(current_setting('app.master_admin_email', true))
),
target_admin as (
  select au.*
  from public.admin_users au
  join target_auth u on u.id=au.auth_user_id
),
target_membership as (
  select tm.*
  from public.tenant_memberships tm
  join target_auth u on u.id=tm.auth_user_id
),
joined as (
  select
    u.id as auth_user_id,
    a.id as admin_user_id,
    m.id as membership_id,
    a.tenant_id,
    t.status as tenant_status,
    a.role::text as admin_role,
    m.role as membership_role,
    a.active as admin_active,
    m.active as membership_active,
    coalesce(a.allowed_branch_ids,'{}'::uuid[]) as admin_branch_ids,
    coalesce(m.branch_ids,'{}'::uuid[]) as membership_branch_ids,
    u.email_confirmed_at is not null as auth_email_confirmed,
    (
      u.id=a.auth_user_id
      and u.id=m.auth_user_id
      and a.id=m.admin_user_id
      and a.tenant_id=m.tenant_id
    ) as identity_consistent,
    (
      a.role::text=m.role
      and coalesce(a.allowed_branch_ids,'{}'::uuid[])=coalesce(m.branch_ids,'{}'::uuid[])
      and a.active=m.active
    ) as authorization_consistent
  from target_auth u
  left join target_admin a on a.auth_user_id=u.id
  left join target_membership m on m.auth_user_id=u.id and m.admin_user_id=a.id and m.tenant_id=a.tenant_id
  left join public.tenants t on t.id=a.tenant_id
)
select
  case
    when not exists(select 1 from target_auth) then 'FAIL_AUTH_USER_NOT_FOUND'
    when not exists(select 1 from target_admin) then 'FAIL_ADMIN_PROFILE_NOT_FOUND'
    when not exists(select 1 from target_membership) then 'FAIL_MEMBERSHIP_NOT_FOUND'
    when exists(select 1 from joined where tenant_status not in ('trial','active','onboarding','pending_validation')) then 'FAIL_TENANT_INACTIVE'
    when exists(select 1 from joined where not identity_consistent) then 'FAIL_IDENTITY_MISMATCH'
    when exists(select 1 from joined where not authorization_consistent) then 'FAIL_AUTHORIZATION_MISMATCH'
    when exists(select 1 from joined where not admin_active or not membership_active) then 'FAIL_ADMIN_OR_MEMBERSHIP_INACTIVE'
    else 'PASS_MASTER_ADMIN_LOGIN_CHAIN'
  end as status,
  jsonb_agg(to_jsonb(joined)) as details
from joined;
