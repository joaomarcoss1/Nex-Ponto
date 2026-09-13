select 'schema_version_5_5_8' as check_name,
       exists(select 1 from public.nexponto_schema_versions where version='5.5.8') as ok;

select 'security_definer_not_public_or_anon' as check_name,
       not exists(
         select 1
           from pg_proc procedure
           join pg_namespace namespace on namespace.oid=procedure.pronamespace
          where namespace.nspname='public'
            and procedure.prosecdef
            and (
              exists(
                select 1
                  from aclexplode(coalesce(procedure.proacl,acldefault('f',procedure.proowner))) privilege
                 where privilege.grantee=0
                   and privilege.privilege_type='EXECUTE'
              )
              or has_function_privilege('anon',procedure.oid,'EXECUTE')
            )
       ) as ok;

select 'public_schema_create_locked' as check_name,
       not has_schema_privilege('public','public','CREATE')
       and not has_schema_privilege('anon','public','CREATE')
       and not has_schema_privilege('authenticated','public','CREATE') as ok;

select 'rls_helpers_authenticated' as check_name,
       has_function_privilege('authenticated','public.has_tenant_permission(uuid,text)','EXECUTE')
       and has_function_privilege('authenticated','public.has_tenant_permission_v54(uuid,text)','EXECUTE') as ok;
