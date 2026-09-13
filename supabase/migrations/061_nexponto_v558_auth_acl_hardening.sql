begin;

-- PostgreSQL concede EXECUTE em novas funções a PUBLIC por padrão. Como as RPCs
-- SECURITY DEFINER do NexPonto operam com privilégios elevados, removemos essa
-- herança e mantemos somente os grants intencionais.
do $$
declare
  function_row record;
begin
  for function_row in
    select procedure.oid::regprocedure signature
      from pg_proc procedure
      join pg_namespace namespace on namespace.oid=procedure.pronamespace
     where namespace.nspname='public'
       and procedure.prosecdef
       and not exists(
         select 1
           from pg_depend dependency
          where dependency.classid='pg_proc'::regclass
            and dependency.objid=procedure.oid
            and dependency.deptype='e'
       )
  loop
    execute format('revoke execute on function %s from public, anon', function_row.signature);
    execute format('grant execute on function %s to service_role', function_row.signature);
  end loop;
end
$$;

-- Impede que migrations futuras voltem a expor funções por herança de PUBLIC.
alter default privileges in schema public revoke execute on functions from public;

-- Usuários da API não podem criar objetos no schema usado pelo search_path das RPCs.
revoke create on schema public from public, anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;

-- Allowlist mínima usada pelas políticas RLS no contexto do usuário autenticado.
revoke all on function public.has_tenant_permission(uuid,text) from public, anon;
grant execute on function public.has_tenant_permission(uuid,text) to authenticated, service_role;
revoke all on function public.has_tenant_permission_v54(uuid,text) from public, anon;
grant execute on function public.has_tenant_permission_v54(uuid,text) to authenticated, service_role;

-- Converte a flag legada editável pelo usuário para metadata protegida. A
-- compatibilidade também existe no login, mas esta atualização fecha sessões
-- administrativas já abertas assim que o token for revalidado.
update auth.users auth_user
   set raw_app_meta_data=coalesce(auth_user.raw_app_meta_data,'{}'::jsonb)
         || jsonb_build_object(
              'must_change_password',
              case lower(coalesce(auth_user.raw_user_meta_data->>'must_change_password','false'))
                when 'true' then true
                else false
              end
            ),
       raw_user_meta_data=coalesce(auth_user.raw_user_meta_data,'{}'::jsonb)
         - 'must_change_password'
         - 'role'
 where coalesce(auth_user.raw_user_meta_data,'{}'::jsonb) ? 'must_change_password'
   and (
     exists(select 1 from public.admin_users admin_user where admin_user.auth_user_id=auth_user.id)
     or exists(select 1 from public.platform_superadmins platform_user where platform_user.auth_user_id=auth_user.id)
   );

insert into public.nexponto_schema_versions(version,notes)
values(
  '5.5.8',
  'SECURITY DEFINER ACL lockdown, public schema CREATE lockdown and server-controlled mandatory password change'
)
on conflict(version) do update set notes=excluded.notes;

commit;
