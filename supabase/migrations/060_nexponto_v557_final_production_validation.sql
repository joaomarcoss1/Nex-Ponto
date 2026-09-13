-- NexPonto v5.5.7 - validação final de produção, admin compensável e jobs resilientes.
begin;

create or replace function public.uuid_array_set_equal_v557(p_left uuid[], p_right uuid[])
returns boolean
language sql
immutable
set search_path=pg_catalog,public,pg_temp
as $$
  select coalesce((
    select array_agg(value order by value)
    from (select distinct unnest(coalesce(p_left,'{}'::uuid[])) value) values_left
  ),'{}'::uuid[]) = coalesce((
    select array_agg(value order by value)
    from (select distinct unnest(coalesce(p_right,'{}'::uuid[])) value) values_right
  ),'{}'::uuid[])
$$;
revoke all on function public.uuid_array_set_equal_v557(uuid[],uuid[]) from public,anon,authenticated;
grant execute on function public.uuid_array_set_equal_v557(uuid[],uuid[]) to service_role;

create or replace function public.is_effective_admin_actor_v557(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_actor_membership_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,auth,pg_temp
as $$
  select exists(
    select 1
      from public.tenant_memberships tm
      join public.admin_users au
        on au.id=tm.admin_user_id
       and au.tenant_id=tm.tenant_id
       and au.auth_user_id=tm.auth_user_id
      join auth.users u on u.id=au.auth_user_id and u.deleted_at is null
     where tm.id=p_actor_membership_id
       and tm.tenant_id=p_tenant_id
       and tm.auth_user_id=p_actor_user_id
       and tm.active
       and au.active
       and tm.role=au.role::text
       and (
         tm.role in ('tenant_owner','master_admin')
         or '*'=any(coalesce(tm.permissions,'{}'::text[]))
         or 'administrators.manage'=any(coalesce(tm.permissions,'{}'::text[]))
       )
  )
$$;
revoke all on function public.is_effective_admin_actor_v557(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.is_effective_admin_actor_v557(uuid,uuid,uuid) to service_role;

create or replace function public.count_effective_master_admins_v557(
  p_tenant_id uuid,
  p_exclude_admin_id uuid default null
)
returns bigint
language sql
stable
security definer
set search_path=pg_catalog,public,auth,pg_temp
as $$
  select count(*)
    from public.admin_users au
    join public.tenant_memberships tm
      on tm.admin_user_id=au.id
     and tm.tenant_id=au.tenant_id
     and tm.auth_user_id=au.auth_user_id
    join auth.users u on u.id=au.auth_user_id and u.deleted_at is null
   where au.tenant_id=p_tenant_id
     and au.id is distinct from p_exclude_admin_id
     and au.active
     and tm.active
     and au.role::text in ('tenant_owner','master_admin')
     and tm.role=au.role::text
$$;
revoke all on function public.count_effective_master_admins_v557(uuid,uuid) from public,anon,authenticated;
grant execute on function public.count_effective_master_admins_v557(uuid,uuid) to service_role;

create or replace function public.upsert_tenant_admin_v557(
  p_tenant_id uuid,
  p_admin_id uuid,
  p_auth_user_id uuid,
  p_email text,
  p_full_name text,
  p_role text,
  p_branch_id uuid,
  p_allowed_branch_ids uuid[],
  p_can_view_financial_data boolean,
  p_active boolean,
  p_actor_user_id uuid,
  p_actor_membership_id uuid,
  p_action text,
  p_request_id text
)
returns public.admin_users
language plpgsql
security definer
set search_path=pg_catalog,public,auth,pg_temp
as $$
declare
  current_admin public.admin_users%rowtype;
  result_admin public.admin_users%rowtype;
begin
  if not public.is_effective_admin_actor_v557(p_tenant_id,p_actor_user_id,p_actor_membership_id) then
    raise exception 'ADMIN_ACTOR_FORBIDDEN';
  end if;
  if not exists(select 1 from auth.users where id=p_auth_user_id and deleted_at is null) then
    raise exception 'ADMIN_AUTH_USER_NOT_FOUND';
  end if;

  if p_admin_id is not null then
    select * into current_admin
      from public.admin_users
     where id=p_admin_id and tenant_id=p_tenant_id
     for update;
    if not found then raise exception 'ADMIN_NOT_FOUND'; end if;

    if current_admin.role::text='tenant_owner' and p_role<>'tenant_owner' then
      raise exception 'TENANT_OWNER_MUTATION_FORBIDDEN';
    end if;
    if current_admin.role::text<>'tenant_owner' and p_role='tenant_owner' then
      raise exception 'TENANT_OWNER_MUTATION_FORBIDDEN';
    end if;
    if current_admin.role::text in ('tenant_owner','master_admin')
       and (p_role not in ('tenant_owner','master_admin') or not coalesce(p_active,true))
       and public.count_effective_master_admins_v557(p_tenant_id,current_admin.id)<1 then
      raise exception 'LAST_EFFECTIVE_MASTER_ADMIN';
    end if;
  elsif p_role='tenant_owner' then
    raise exception 'TENANT_OWNER_MUTATION_FORBIDDEN';
  end if;

  select * into result_admin
    from public.upsert_tenant_admin_v556(
      p_tenant_id,p_admin_id,p_auth_user_id,p_email,p_full_name,p_role,p_branch_id,
      p_allowed_branch_ids,p_can_view_financial_data,p_active,p_actor_user_id,
      p_actor_membership_id,p_action,p_request_id
    );
  return result_admin;
end
$$;
revoke all on function public.upsert_tenant_admin_v557(uuid,uuid,uuid,text,text,text,uuid,uuid[],boolean,boolean,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.upsert_tenant_admin_v557(uuid,uuid,uuid,text,text,text,uuid,uuid[],boolean,boolean,uuid,uuid,text,text) to service_role;

create or replace function public.rollback_tenant_admin_creation_v557(
  p_tenant_id uuid,
  p_admin_id uuid,
  p_auth_user_id uuid,
  p_actor_user_id uuid,
  p_actor_membership_id uuid,
  p_request_id text,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public,auth,pg_temp
as $$
declare
  old_admin public.admin_users%rowtype;
begin
  if not public.is_effective_admin_actor_v557(p_tenant_id,p_actor_user_id,p_actor_membership_id) then
    raise exception 'ADMIN_ACTOR_FORBIDDEN';
  end if;

  select * into old_admin
    from public.admin_users
   where id=p_admin_id and tenant_id=p_tenant_id and auth_user_id=p_auth_user_id
   for update;
  if not found then return false; end if;
  if old_admin.role::text in ('tenant_owner','master_admin') then
    raise exception 'MASTER_ADMIN_ROLLBACK_FORBIDDEN';
  end if;

  delete from public.tenant_memberships
   where tenant_id=p_tenant_id and admin_user_id=p_admin_id and auth_user_id=p_auth_user_id;
  delete from public.admin_users
   where id=p_admin_id and tenant_id=p_tenant_id and auth_user_id=p_auth_user_id;

  insert into public.audit_logs(
    tenant_id,membership_id,user_id,user_email,action,entity,entity_id,old_data,new_data,request_id,reason
  ) values (
    p_tenant_id,p_actor_membership_id,p_actor_user_id,'sistema','rollback_admin_creation',
    'admin_users',p_admin_id::text,to_jsonb(old_admin)-'pin_hash',null,p_request_id,left(coalesce(p_reason,'Falha de sincronização Auth'),500)
  );
  return true;
end
$$;
revoke all on function public.rollback_tenant_admin_creation_v557(uuid,uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.rollback_tenant_admin_creation_v557(uuid,uuid,uuid,uuid,uuid,text,text) to service_role;

create or replace function public.restore_tenant_admin_snapshot_v557(
  p_tenant_id uuid,
  p_admin_id uuid,
  p_current_auth_user_id uuid,
  p_old_admin jsonb,
  p_actor_user_id uuid,
  p_actor_membership_id uuid,
  p_request_id text
)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public,auth,pg_temp
as $$
declare
  old_auth_user_id uuid := nullif(p_old_admin->>'auth_user_id','')::uuid;
  old_role text := p_old_admin->>'role';
  old_branches uuid[] := coalesce(
    array(select value::uuid from jsonb_array_elements_text(coalesce(p_old_admin->'allowed_branch_ids','[]'::jsonb)) value),
    '{}'::uuid[]
  );
begin
  if not public.is_effective_admin_actor_v557(p_tenant_id,p_actor_user_id,p_actor_membership_id) then
    raise exception 'ADMIN_ACTOR_FORBIDDEN';
  end if;
  if coalesce(p_old_admin->>'tenant_id','')<>p_tenant_id::text or coalesce(p_old_admin->>'id','')<>p_admin_id::text then
    raise exception 'ADMIN_SNAPSHOT_TENANT_MISMATCH';
  end if;

  delete from public.tenant_memberships
   where tenant_id=p_tenant_id
     and (admin_user_id=p_admin_id or auth_user_id=p_current_auth_user_id);

  update public.admin_users
     set auth_user_id=old_auth_user_id,
         email=p_old_admin->>'email',
         full_name=p_old_admin->>'full_name',
         role=old_role::public.admin_role,
         branch_id=nullif(p_old_admin->>'branch_id','')::uuid,
         allowed_branch_ids=old_branches,
         can_view_financial_data=coalesce((p_old_admin->>'can_view_financial_data')::boolean,false),
         active=coalesce((p_old_admin->>'active')::boolean,false),
         updated_at=now()
   where id=p_admin_id and tenant_id=p_tenant_id;
  if not found then raise exception 'ADMIN_NOT_FOUND'; end if;

  if old_auth_user_id is not null then
    insert into public.tenant_memberships(
      tenant_id,auth_user_id,admin_user_id,role,permissions,branch_ids,active,accepted_at,invite_status
    ) values (
      p_tenant_id,old_auth_user_id,p_admin_id,old_role,
      public.admin_permissions_for_role_v556(old_role),old_branches,
      coalesce((p_old_admin->>'active')::boolean,false),now(),'accepted'
    )
    on conflict(tenant_id,auth_user_id) do update
      set admin_user_id=excluded.admin_user_id,role=excluded.role,permissions=excluded.permissions,
          branch_ids=excluded.branch_ids,active=excluded.active,updated_at=now();
  end if;

  insert into public.audit_logs(
    tenant_id,membership_id,user_id,user_email,action,entity,entity_id,new_data,request_id,reason
  ) values (
    p_tenant_id,p_actor_membership_id,p_actor_user_id,'sistema','restore_admin_snapshot',
    'admin_users',p_admin_id::text,p_old_admin-'pin_hash',p_request_id,
    'Compensação após falha de sincronização com Supabase Auth'
  );
  return true;
end
$$;
revoke all on function public.restore_tenant_admin_snapshot_v557(uuid,uuid,uuid,jsonb,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.restore_tenant_admin_snapshot_v557(uuid,uuid,uuid,jsonb,uuid,uuid,text) to service_role;

create or replace function public.reconcile_admin_memberships_v557()
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,auth,pg_temp
as $$
declare
  memberships_created integer := 0;
  links_repaired integer := 0;
  safely_deactivated integer := 0;
  ambiguous integer := 0;
begin
  insert into public.tenant_memberships(
    tenant_id,auth_user_id,admin_user_id,role,permissions,branch_ids,active,accepted_at,invite_status
  )
  select au.tenant_id,au.auth_user_id,au.id,au.role::text,
         public.admin_permissions_for_role_v556(au.role::text),
         coalesce(au.allowed_branch_ids,'{}'::uuid[]),au.active,now(),'accepted'
    from public.admin_users au
    join auth.users u on u.id=au.auth_user_id and u.deleted_at is null
   where au.auth_user_id is not null
     and (select count(*) from public.admin_users candidate where candidate.tenant_id=au.tenant_id and candidate.auth_user_id=au.auth_user_id)=1
     and not exists(
       select 1 from public.tenant_memberships tm
        where tm.tenant_id=au.tenant_id and tm.auth_user_id=au.auth_user_id
     )
  on conflict(tenant_id,auth_user_id) do nothing;
  get diagnostics memberships_created=row_count;

  update public.tenant_memberships tm
     set admin_user_id=au.id,updated_at=now()
    from public.admin_users au
   where tm.tenant_id=au.tenant_id
     and tm.auth_user_id=au.auth_user_id
     and tm.admin_user_id is null
     and (select count(*) from public.admin_users candidate where candidate.tenant_id=au.tenant_id and candidate.auth_user_id=au.auth_user_id)=1;
  get diagnostics links_repaired=row_count;

  update public.admin_users au
     set active=false,updated_at=now()
    from public.tenant_memberships tm
   where tm.admin_user_id=au.id
     and tm.tenant_id=au.tenant_id
     and tm.auth_user_id=au.auth_user_id
     and au.active is distinct from tm.active
     and (not au.active or not tm.active);
  get diagnostics safely_deactivated=row_count;

  update public.tenant_memberships tm
     set active=false,updated_at=now()
    from public.admin_users au
   where tm.admin_user_id=au.id
     and tm.tenant_id=au.tenant_id
     and tm.auth_user_id=au.auth_user_id
     and not au.active
     and tm.active;

  select count(*) into ambiguous
    from public.tenant_memberships tm
    join public.admin_users au
      on au.tenant_id=tm.tenant_id and au.auth_user_id=tm.auth_user_id
   where tm.admin_user_id is distinct from au.id
      or tm.role is distinct from au.role::text
      or not public.uuid_array_set_equal_v557(tm.branch_ids,au.allowed_branch_ids);

  insert into public.admin_membership_reconciliation_logs(action,affected_count,details)
  values(
    'reconcile_admin_memberships_v557',memberships_created+links_repaired+safely_deactivated,
    jsonb_build_object(
      'membershipsCreated',memberships_created,
      'linksRepaired',links_repaired,
      'safelyDeactivated',safely_deactivated,
      'ambiguousConflicts',ambiguous,
      'ambiguousAction',case when ambiguous>0 then 'RECONCILIATION_AMBIGUOUS' else null end
    )
  );

  return jsonb_build_object(
    'membershipsCreated',memberships_created,
    'linksRepaired',links_repaired,
    'safelyDeactivated',safely_deactivated,
    'ambiguousConflicts',ambiguous,
    'status',case when ambiguous>0 then 'RECONCILIATION_AMBIGUOUS' else 'OK' end
  );
end
$$;
revoke all on function public.reconcile_admin_memberships_v557() from public,anon,authenticated;
grant execute on function public.reconcile_admin_memberships_v557() to service_role;

-- Garante search_path explícito também para funções SECURITY DEFINER históricas
-- já instaladas, sem alterar os arquivos de migration que podem estar aplicados.
do $$
declare function_row record;
begin
  for function_row in
    select procedure.oid::regprocedure signature
      from pg_proc procedure
      join pg_namespace namespace on namespace.oid=procedure.pronamespace
     where namespace.nspname='public'
       and procedure.prosecdef
       and not exists(
         select 1 from pg_depend dependency
          where dependency.classid='pg_proc'::regclass
            and dependency.objid=procedure.oid
            and dependency.deptype='e'
       )
  loop
    execute format(
      'alter function %s set search_path to pg_catalog, public, auth, extensions, pg_temp',
      function_row.signature
    );
  end loop;
end
$$;

insert into public.nexponto_schema_versions(version,notes)
values('5.5.7','Effective-master protection, compensable admin sync, conservative reconciliation, explicit SECURITY DEFINER search_path and final production validation')
on conflict(version) do update set notes=excluded.notes;

commit;
