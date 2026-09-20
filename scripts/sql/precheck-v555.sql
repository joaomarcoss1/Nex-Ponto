select jsonb_build_object(
  'reconcileReturnType', (
    select pg_get_function_result(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='reconcile_admin_memberships_v55'
      and pg_get_function_arguments(p.oid)=''
    limit 1
  ),
  'hasIncompatibleReconcile', exists(
    select 1
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='reconcile_admin_memberships_v55'
      and pg_get_function_arguments(p.oid)=''
      and lower(pg_get_function_result(p.oid)) <> 'jsonb'
  ),
  'adminMembershipIdentityMismatch', exists(
    select 1
    from public.tenant_memberships tm
    join public.admin_users a on a.id=tm.admin_user_id
    where tm.admin_user_id is not null
      and (a.tenant_id is distinct from tm.tenant_id or a.auth_user_id is distinct from tm.auth_user_id)
  ),
  'crossTenantBranches', exists(
    select 1
    from public.employees e
    join public.branches b on b.id=e.branch_id
    where b.tenant_id is distinct from e.tenant_id
  ),
  'missingCriticalMigration554', not exists(
    select 1 from public.nexponto_schema_versions where version='5.5.4'
  ),
  'exportsBucketAllowsTextPlain', exists(
    select 1
    from storage.buckets
    where id='exports'
      and public=false
      and allowed_mime_types @> array['text/plain']::text[]
  )
) as precheck_v555;
