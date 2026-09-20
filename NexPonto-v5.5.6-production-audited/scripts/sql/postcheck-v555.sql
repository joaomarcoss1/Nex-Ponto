select jsonb_build_object(
  'schemaVersion555', exists(
    select 1 from public.nexponto_schema_versions where version='5.5.5'
  ),
  'criticalFunctions', (
    select jsonb_object_agg(name, present order by name)
    from (
      select required.name, exists(
        select 1
        from pg_proc p
        join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname=required.name
      ) as present
      from unnest(array[
        'has_tenant_permission',
        'has_tenant_permission_v54',
        'reconcile_admin_memberships_v55',
        'upsert_employee_v552',
        'bulk_set_employee_pins_v554',
        'claim_background_job_v554',
        'fail_background_job_v554',
        'heartbeat_background_job_v553',
        'complete_background_job_v553'
      ]) as required(name)
    ) checks
  ),
  'reconcileReturnType', (
    select pg_get_function_result(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='reconcile_admin_memberships_v55'
      and pg_get_function_arguments(p.oid)=''
    limit 1
  ),
  'exportsBucketPrivateTextPlain', exists(
    select 1
    from storage.buckets
    where id='exports'
      and public=false
      and allowed_mime_types @> array['text/plain']::text[]
  )
) as postcheck_v555;
