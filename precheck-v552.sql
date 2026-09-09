-- Execute com service_role antes da migration 055.
-- Opcional: SET app.settings.master_admin_email = 'master@empresa.com';
with checks as (
  select 'auth_user_master'::text as check_name,
    exists(select 1 from auth.users where lower(email)=lower(current_setting('app.settings.master_admin_email',true))) as passed,
    'auth.users deve conter o e-mail definido em app.settings.master_admin_email'::text as detail
  union all
  select 'admin_users_master',exists(
    select 1 from public.admin_users a
    where lower(a.email)=lower(current_setting('app.settings.master_admin_email',true)) and a.active
  ),'admin_users ativo para o master'
  union all
  select 'membership_master',exists(
    select 1 from public.tenant_memberships tm
    join auth.users u on u.id=tm.auth_user_id
    where lower(u.email)=lower(current_setting('app.settings.master_admin_email',true)) and tm.active
  ),'membership ativo para o master'
  union all
  select 'tenant_active',exists(select 1 from public.tenants where status in ('trial','active')),'ao menos um tenant operacional'
  union all
  select 'permission_v54',to_regprocedure('public.has_tenant_permission_v54(uuid,text)') is not null,'compatibilidade de permissão v54'
  union all
  select 'clock_rpc',exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='register_time_entry_v4'
  ),'RPC transacional de ponto'
  union all
  select 'nsr_unique',exists(
    select 1 from pg_indexes where schemaname='public' and tablename='time_entries' and indexdef ilike '%unique%tenant_id%nsr%'
  ),'NSR único por tenant'
)
select check_name,case when passed then 'PASS' else 'FAIL' end as status,detail
from checks order by check_name;
