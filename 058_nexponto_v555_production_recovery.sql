-- NexPonto v5.5.5 — recuperação de produção e runtime multiempresa.
-- Incremental, idempotente e sem operações destrutivas de dados.

begin;

do $$
declare
  existing_oid oid;
  existing_return text;
  legacy_name text;
begin
  select p.oid, pg_get_function_result(p.oid)
    into existing_oid, existing_return
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='reconcile_admin_memberships_v55'
    and pg_get_function_arguments(p.oid)='';

  if existing_oid is not null and lower(existing_return) <> 'jsonb' then
    legacy_name := 'reconcile_admin_memberships_v55_legacy_' || to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS');
    execute format('alter function public.reconcile_admin_memberships_v55() rename to %I', legacy_name);
  end if;
end $$;

create or replace function public.reconcile_admin_memberships_v55()
returns jsonb language plpgsql security definer
set search_path=public,auth,pg_temp as $$
declare
  inserted_memberships integer := 0;
  inserted_admins integer := 0;
  repaired_links integer := 0;
begin
  insert into public.tenant_memberships(
    tenant_id,auth_user_id,admin_user_id,role,permissions,branch_ids,active,accepted_at,invite_status
  )
  select a.tenant_id,a.auth_user_id,a.id,a.role::text,
    case when a.role::text='master_admin' then array['*']::text[] else '{}'::text[] end,
    coalesce(a.allowed_branch_ids,'{}'::uuid[]),a.active,now(),'accepted'
  from public.admin_users a
  where a.auth_user_id is not null
    and not exists(
      select 1 from public.tenant_memberships tm
      where tm.tenant_id=a.tenant_id and tm.auth_user_id=a.auth_user_id
    )
  on conflict(tenant_id,auth_user_id) do nothing;
  get diagnostics inserted_memberships=row_count;

  insert into public.admin_users(auth_user_id,email,full_name,role,active,tenant_id,allowed_branch_ids)
  select tm.auth_user_id,u.email,
    coalesce(nullif(u.raw_user_meta_data->>'full_name',''),split_part(u.email,'@',1)),
    case
      when tm.role='master_admin' then 'master_admin'::public.admin_role
      when tm.role in ('tenant_admin','admin_geral') then 'admin_geral'::public.admin_role
      when tm.role in ('hr_manager','payroll_manager','rh_financeiro') then 'rh_financeiro'::public.admin_role
      when tm.role in ('branch_manager','gerente_filial') then 'gerente_filial'::public.admin_role
      else 'admin'::public.admin_role
    end,
    tm.active,tm.tenant_id,coalesce(tm.branch_ids,'{}'::uuid[])
  from public.tenant_memberships tm
  join auth.users u on u.id=tm.auth_user_id
  where tm.admin_user_id is null
    and not exists(
      select 1 from public.admin_users a
      where a.tenant_id=tm.tenant_id and a.auth_user_id=tm.auth_user_id
    )
  on conflict do nothing;
  get diagnostics inserted_admins=row_count;

  update public.tenant_memberships tm
  set admin_user_id=a.id,updated_at=now()
  from public.admin_users a
  where tm.tenant_id=a.tenant_id
    and tm.auth_user_id=a.auth_user_id
    and tm.admin_user_id is distinct from a.id;
  get diagnostics repaired_links=row_count;

  insert into public.admin_membership_reconciliation_logs(action,affected_count,details)
  values(
    'reconcile_admin_memberships_v55',
    inserted_memberships+inserted_admins+repaired_links,
    jsonb_build_object(
      'membershipsCreated',inserted_memberships,
      'adminsCreated',inserted_admins,
      'linksRepaired',repaired_links
    )
  );

  return jsonb_build_object(
    'membershipsCreated',inserted_memberships,
    'adminsCreated',inserted_admins,
    'linksRepaired',repaired_links
  );
end $$;
revoke all on function public.reconcile_admin_memberships_v55() from public,anon,authenticated;
grant execute on function public.reconcile_admin_memberships_v55() to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values
  ('exports','exports',false,52428800,array['application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/csv','text/plain']),
  ('payroll-exports','payroll-exports',false,52428800,array['application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/csv'])
on conflict(id) do update set
  public=false,
  allowed_mime_types=case
    when excluded.id='exports' then array['application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/csv','text/plain']
    else excluded.allowed_mime_types
  end;

do $$
declare
  missing text[];
begin
  select array_agg(name order by name)
    into missing
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
  where not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=required.name
  );

  if coalesce(array_length(missing,1),0) > 0 then
    raise exception 'NEXPONTO_V555_MISSING_FUNCTIONS:%', array_to_string(missing,',');
  end if;

  if not exists (
    select 1 from storage.buckets
    where id='exports'
      and public=false
      and allowed_mime_types @> array['text/plain']::text[]
  ) then
    raise exception 'NEXPONTO_V555_EXPORTS_BUCKET_TEXT_PLAIN_NOT_READY';
  end if;
end $$;

insert into public.nexponto_schema_versions(version,notes)
values('5.5.5','Production Recovery & Multi-Tenant Runtime Hardening')
on conflict(version) do nothing;

commit;
