-- NexPonto v5.5.6 - remediacao final de auth/admin, jobs e producao.
begin;

alter table public.background_jobs add column if not exists lease_token uuid;
create index if not exists idx_background_jobs_lease_token_v556
  on public.background_jobs(id,worker_id,lease_token)
  where status='running';

alter table public.platform_superadmins alter column mfa_required set default false;
update public.platform_superadmins set mfa_required=false where mfa_required is distinct from false;

create or replace function public.bootstrap_tenant_owner_v4(
  p_auth_user_id uuid,
  p_email text,
  p_full_name text,
  p_tenant_slug text,
  p_tenant_name text,
  p_timezone text default 'America/Fortaleza',
  p_make_platform_superadmin boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  tenant_row public.tenants%rowtype;
  admin_row public.admin_users%rowtype;
  membership_row public.tenant_memberships%rowtype;
  plan_row public.subscription_plans%rowtype;
begin
  if p_auth_user_id is null then raise exception 'AUTH_USER_REQUIRED'; end if;
  if p_email is null or position('@' in p_email) < 2 then raise exception 'VALID_EMAIL_REQUIRED'; end if;
  if length(trim(coalesce(p_full_name,''))) < 3 then raise exception 'FULL_NAME_REQUIRED'; end if;
  if p_tenant_slug !~ '^[a-z0-9][a-z0-9-]{1,62}$' then raise exception 'INVALID_TENANT_SLUG'; end if;
  if length(trim(coalesce(p_tenant_name,''))) < 2 then raise exception 'TENANT_NAME_REQUIRED'; end if;

  if exists (
    select 1 from public.tenant_memberships tm
    where tm.active and tm.role in ('tenant_owner','master_admin')
  ) then
    raise exception 'BOOTSTRAP_ALREADY_COMPLETED';
  end if;

  select * into plan_row from public.subscription_plans
  where active and code='professional'
  limit 1;
  if not found then
    select * into plan_row from public.subscription_plans where active order by created_at limit 1;
  end if;

  select * into tenant_row from public.tenants where slug=p_tenant_slug for update;
  if found then
    if exists(select 1 from public.tenant_memberships where tenant_id=tenant_row.id) then
      raise exception 'TENANT_SLUG_ALREADY_USED';
    end if;
    update public.tenants
    set legal_name=trim(p_tenant_name), display_name=trim(p_tenant_name),
        status='onboarding', onboarding_status='in_progress',
        default_timezone=coalesce(nullif(p_timezone,''),'America/Fortaleza'),
        plan_id=coalesce(plan_id,plan_row.id), contact_email=lower(trim(p_email)), updated_at=now()
    where id=tenant_row.id returning * into tenant_row;
  else
    insert into public.tenants(
      slug,legal_name,display_name,status,onboarding_status,default_timezone,
      plan_id,contact_email,public_access_code
    ) values (
      p_tenant_slug,trim(p_tenant_name),trim(p_tenant_name),'onboarding','in_progress',
      coalesce(nullif(p_timezone,''),'America/Fortaleza'),plan_row.id,lower(trim(p_email)),
      encode(gen_random_bytes(12),'hex')
    ) returning * into tenant_row;
  end if;

  select * into admin_row
  from public.admin_users
  where tenant_id=tenant_row.id and lower(email)=lower(trim(p_email))
  for update;

  if found then
    update public.admin_users
    set auth_user_id=p_auth_user_id, full_name=trim(p_full_name), role='tenant_owner', active=true, updated_at=now()
    where id=admin_row.id returning * into admin_row;
  else
    insert into public.admin_users(
      tenant_id,auth_user_id,email,full_name,role,active,allowed_branch_ids,can_view_financial_data
    ) values (
      tenant_row.id,p_auth_user_id,lower(trim(p_email)),trim(p_full_name),'tenant_owner',true,'{}'::uuid[],true
    ) returning * into admin_row;
  end if;

  insert into public.tenant_memberships(
    tenant_id,auth_user_id,admin_user_id,role,permissions,branch_ids,active,invited_at,accepted_at
  ) values (
    tenant_row.id,p_auth_user_id,admin_row.id,'tenant_owner',array['*'],'{}'::uuid[],true,now(),now()
  )
  on conflict (tenant_id,auth_user_id) do update
    set admin_user_id=excluded.admin_user_id,role='tenant_owner',permissions=array['*'],active=true,accepted_at=now(),updated_at=now()
  returning * into membership_row;

  insert into public.tenant_branding(tenant_id,app_name,short_name,tagline,report_footer,updated_by)
  values(tenant_row.id,'NexPonto','NexPonto','Gestão inteligente de jornadas','Relatório gerado pelo NexPonto',p_auth_user_id)
  on conflict (tenant_id) do nothing;

  insert into public.tenant_subscriptions(tenant_id,plan_id,status,starts_at)
  select tenant_row.id,plan_row.id,'trialing',now()
  where plan_row.id is not null
    and not exists(select 1 from public.tenant_subscriptions where tenant_id=tenant_row.id and status in ('trialing','active'));

  insert into public.tenant_onboarding_steps(tenant_id,step_key,status)
  select tenant_row.id,step_key,case when step_key='company' then 'completed' else 'pending' end
  from unnest(array['company','branding','first_branch','operating_hours','clock_policy','admin_team','gps_test','qr_test','activation']) step_key
  on conflict (tenant_id,step_key) do nothing;

  if p_make_platform_superadmin then
    insert into public.platform_superadmins(auth_user_id,email,full_name,active,mfa_required)
    values(p_auth_user_id,lower(trim(p_email)),trim(p_full_name),true,false)
    on conflict (auth_user_id) do update
      set email=excluded.email,full_name=excluded.full_name,active=true,mfa_required=false,updated_at=now();
  end if;

  insert into public.platform_audit_logs(actor_user_id,tenant_id,action,resource_type,resource_id,metadata)
  values(
    p_auth_user_id,tenant_row.id,'bootstrap_tenant_owner','tenant',tenant_row.id::text,
    jsonb_build_object('tenant_slug',tenant_row.slug,'owner_email',lower(trim(p_email)),'platform_superadmin',p_make_platform_superadmin)
  );

  return jsonb_build_object(
    'tenant',to_jsonb(tenant_row),
    'admin',to_jsonb(admin_row)-'pin_hash',
    'membership',to_jsonb(membership_row)
  );
end;
$$;
revoke all on function public.bootstrap_tenant_owner_v4(uuid,text,text,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.bootstrap_tenant_owner_v4(uuid,text,text,text,text,text,boolean) to service_role;

create or replace function public.admin_permissions_for_role_v556(p_role text)
returns text[]
language sql
stable
set search_path=public,pg_temp
as $$
  select case p_role
    when 'master_admin' then array['*']::text[]
    when 'tenant_owner' then array['*']::text[]
    when 'tenant_admin' then array['*']::text[]
    when 'admin_geral' then array['*']::text[]
    when 'rh_financeiro' then array[
      'employee.manage','schedule.manage','time_entry.review','overtime.review',
      'time_bank.manage','payroll.view','payroll.calculate','payroll.approve',
      'payroll.resolve_divergence','payroll.hr_approve','payroll.financial_approve',
      'payroll.close','payroll.export','payroll.reopen','reports.export','financial.view'
    ]::text[]
    when 'admin' then array[
      'branch.manage','employee.manage','schedule.manage','time_entry.review',
      'overtime.review','time_bank.manage','payroll.view','reports.export'
    ]::text[]
    when 'gerente_filial' then array[
      'employee.manage','schedule.manage','time_entry.review','overtime.review',
      'time_bank.manage','reports.export'
    ]::text[]
    when 'branch_manager' then array[
      'employee.manage','schedule.manage','time_entry.review','overtime.review',
      'time_bank.manage','reports.export'
    ]::text[]
    else array[]::text[]
  end
$$;
revoke all on function public.admin_permissions_for_role_v556(text) from public,anon,authenticated;
grant execute on function public.admin_permissions_for_role_v556(text) to service_role;

create or replace function public.upsert_tenant_admin_v556(
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
set search_path=public,auth,pg_temp
as $$
declare
  admin_row public.admin_users%rowtype;
  existing_membership public.tenant_memberships%rowtype;
  old_admin jsonb;
  normalized_email text := lower(trim(coalesce(p_email,'')));
  normalized_role text := coalesce(nullif(trim(p_role),''),'admin');
  normalized_branches uuid[] := coalesce(p_allowed_branch_ids,'{}'::uuid[]);
  membership_permissions text[] := public.admin_permissions_for_role_v556(normalized_role);
begin
  if p_tenant_id is null or p_auth_user_id is null then raise exception 'ADMIN_CONTEXT_REQUIRED'; end if;
  if normalized_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'ADMIN_EMAIL_INVALID'; end if;
  if length(trim(coalesce(p_full_name,''))) < 2 then raise exception 'ADMIN_NAME_INVALID'; end if;
  if normalized_role not in ('master_admin','tenant_owner','tenant_admin','admin_geral','admin','gerente_filial','branch_manager','rh_financeiro') then
    raise exception 'ADMIN_ROLE_INVALID';
  end if;
  if not exists(select 1 from public.tenants where id=p_tenant_id and status not in ('suspended','cancelled','archived')) then
    raise exception 'TENANT_INACTIVE_OR_NOT_FOUND';
  end if;
  if p_branch_id is not null and not exists(select 1 from public.branches where id=p_branch_id and tenant_id=p_tenant_id) then
    raise exception 'ADMIN_BRANCH_TENANT_MISMATCH';
  end if;
  if exists(
    select 1 from unnest(normalized_branches) branch_id
    where not exists(select 1 from public.branches b where b.id=branch_id and b.tenant_id=p_tenant_id)
  ) then
    raise exception 'ADMIN_ALLOWED_BRANCH_TENANT_MISMATCH';
  end if;

  if p_admin_id is not null then
    select * into admin_row from public.admin_users where id=p_admin_id and tenant_id=p_tenant_id for update;
  else
    select * into admin_row
    from public.admin_users
    where tenant_id=p_tenant_id and (lower(email)=normalized_email or auth_user_id=p_auth_user_id)
    order by created_at
    for update
    limit 1;
  end if;
  old_admin := case when found then to_jsonb(admin_row) else null end;

  if found and admin_row.auth_user_id is not null and admin_row.auth_user_id <> p_auth_user_id then
    raise exception 'ADMIN_AUTH_USER_CONFLICT';
  end if;
  if found and admin_row.role::text='master_admin' and (normalized_role <> 'master_admin' or p_active=false) then
    if (select count(*) from public.admin_users where tenant_id=p_tenant_id and role::text='master_admin' and active and id<>admin_row.id) < 1 then
      raise exception 'LAST_MASTER_ADMIN';
    end if;
  end if;

  if found then
    update public.admin_users
      set auth_user_id=p_auth_user_id,
          email=normalized_email,
          full_name=trim(p_full_name),
          role=normalized_role::public.admin_role,
          branch_id=p_branch_id,
          allowed_branch_ids=normalized_branches,
          can_view_financial_data=coalesce(p_can_view_financial_data,false),
          active=coalesce(p_active,true),
          updated_at=now()
    where id=admin_row.id
    returning * into admin_row;
  else
    insert into public.admin_users(
      tenant_id,auth_user_id,email,full_name,role,branch_id,allowed_branch_ids,can_view_financial_data,active
    ) values (
      p_tenant_id,p_auth_user_id,normalized_email,trim(p_full_name),normalized_role::public.admin_role,
      p_branch_id,normalized_branches,coalesce(p_can_view_financial_data,false),coalesce(p_active,true)
    )
    returning * into admin_row;
  end if;

  select * into existing_membership
  from public.tenant_memberships
  where tenant_id=p_tenant_id and auth_user_id=p_auth_user_id
  for update;
  if found and existing_membership.admin_user_id is not null and existing_membership.admin_user_id <> admin_row.id then
    raise exception 'ADMIN_MEMBERSHIP_AMBIGUOUS';
  end if;

  insert into public.tenant_memberships(
    tenant_id,auth_user_id,admin_user_id,role,permissions,branch_ids,active,accepted_at,invite_status
  ) values (
    p_tenant_id,p_auth_user_id,admin_row.id,normalized_role,membership_permissions,normalized_branches,
    coalesce(p_active,true),now(),'accepted'
  )
  on conflict(tenant_id,auth_user_id) do update
    set admin_user_id=excluded.admin_user_id,
        role=excluded.role,
        permissions=excluded.permissions,
        branch_ids=excluded.branch_ids,
        active=excluded.active,
        accepted_at=coalesce(public.tenant_memberships.accepted_at,now()),
        invite_status='accepted',
        updated_at=now();

  insert into public.audit_logs(tenant_id,membership_id,user_id,user_email,action,entity,entity_id,old_data,new_data,request_id)
  values(
    p_tenant_id,p_actor_membership_id,p_actor_user_id,'sistema',
    coalesce(nullif(p_action,''),'upsert_admin'),'admin_users',admin_row.id::text,
    old_admin,to_jsonb(admin_row)-'pin_hash',p_request_id
  );

  return admin_row;
end $$;
revoke all on function public.upsert_tenant_admin_v556(uuid,uuid,uuid,text,text,text,uuid,uuid[],boolean,boolean,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.upsert_tenant_admin_v556(uuid,uuid,uuid,text,text,text,uuid,uuid[],boolean,boolean,uuid,uuid,text,text) to service_role;

create or replace function public.reconcile_admin_memberships_v55()
returns jsonb language plpgsql security definer
set search_path=public,auth,pg_temp as $$
declare
  inserted_memberships integer := 0;
  repaired_links integer := 0;
  synced_profiles integer := 0;
  ambiguous integer := 0;
begin
  insert into public.tenant_memberships(
    tenant_id,auth_user_id,admin_user_id,role,permissions,branch_ids,active,accepted_at,invite_status
  )
  select a.tenant_id,a.auth_user_id,a.id,a.role::text,
    public.admin_permissions_for_role_v556(a.role::text),
    coalesce(a.allowed_branch_ids,'{}'::uuid[]),a.active,now(),'accepted'
  from public.admin_users a
  where a.auth_user_id is not null
    and not exists(
      select 1 from public.tenant_memberships tm
      where tm.tenant_id=a.tenant_id and tm.auth_user_id=a.auth_user_id
    )
  on conflict(tenant_id,auth_user_id) do nothing;
  get diagnostics inserted_memberships=row_count;

  update public.tenant_memberships tm
     set admin_user_id=a.id,
         role=a.role::text,
         permissions=public.admin_permissions_for_role_v556(a.role::text),
         branch_ids=coalesce(a.allowed_branch_ids,'{}'::uuid[]),
         active=a.active,
         updated_at=now()
    from public.admin_users a
   where tm.tenant_id=a.tenant_id
     and tm.auth_user_id=a.auth_user_id
     and (tm.admin_user_id is null or tm.admin_user_id=a.id)
     and (
       tm.admin_user_id is distinct from a.id
       or tm.role is distinct from a.role::text
       or tm.permissions is distinct from public.admin_permissions_for_role_v556(a.role::text)
       or tm.branch_ids is distinct from coalesce(a.allowed_branch_ids,'{}'::uuid[])
       or tm.active is distinct from a.active
     );
  get diagnostics synced_profiles=row_count;
  repaired_links := synced_profiles;

  select count(*) into ambiguous
  from public.tenant_memberships tm
  join public.admin_users a on a.tenant_id=tm.tenant_id and a.auth_user_id=tm.auth_user_id
  where tm.admin_user_id is not null and tm.admin_user_id <> a.id;

  insert into public.admin_membership_reconciliation_logs(action,affected_count,details)
  values(
    'reconcile_admin_memberships_v556',
    inserted_memberships+repaired_links,
    jsonb_build_object(
      'membershipsCreated',inserted_memberships,
      'profilesSynced',synced_profiles,
      'ambiguousConflicts',ambiguous
    )
  );

  return jsonb_build_object(
    'membershipsCreated',inserted_memberships,
    'linksRepaired',repaired_links,
    'profilesSynced',synced_profiles,
    'ambiguousConflicts',ambiguous
  );
end $$;
revoke all on function public.reconcile_admin_memberships_v55() from public,anon,authenticated;
grant execute on function public.reconcile_admin_memberships_v55() to service_role;

create or replace function public.claim_background_job_v556(
  p_worker_id text,
  p_job_types text[]
)
returns setof public.background_jobs
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  claimed public.background_jobs%rowtype;
  token uuid := gen_random_uuid();
begin
  if nullif(trim(p_worker_id),'') is null or coalesce(cardinality(p_job_types),0)=0 then
    raise exception 'JOB_CLAIM_CONTEXT_REQUIRED';
  end if;

  select * into claimed
    from public.background_jobs
   where job_type=any(p_job_types)
     and ((status='queued' and run_after<=now()) or (status='running' and lease_expires_at<=now()))
     and attempts<max_attempts
   order by run_after,created_at
   for update skip locked
   limit 1;
  if not found then return; end if;

  update public.background_jobs
     set status='running',attempts=attempts+1,worker_id=p_worker_id,lease_token=token,
         started_at=coalesce(started_at,now()),last_heartbeat_at=now(),
         lease_expires_at=now()+interval '5 minutes',updated_at=now()
   where id=claimed.id
  returning * into claimed;
  insert into public.background_job_events(tenant_id,job_id,event_type,details)
  values(claimed.tenant_id,claimed.id,'claimed',jsonb_build_object('worker_id',p_worker_id,'lease_token',token,'attempt',claimed.attempts));
  return next claimed;
end $$;
revoke all on function public.claim_background_job_v556(text,text[]) from public,anon,authenticated;
grant execute on function public.claim_background_job_v556(text,text[]) to service_role;

create or replace function public.heartbeat_background_job_v556(
  p_job_id uuid,
  p_worker_id text,
  p_lease_token uuid
)
returns public.background_jobs
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare job public.background_jobs%rowtype;
begin
  update public.background_jobs
     set last_heartbeat_at=now(),lease_expires_at=now()+interval '5 minutes',updated_at=now()
   where id=p_job_id and status='running' and worker_id=p_worker_id and lease_token=p_lease_token
  returning * into job;
  if not found then raise exception 'JOB_LEASE_LOST'; end if;
  return job;
end $$;
revoke all on function public.heartbeat_background_job_v556(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.heartbeat_background_job_v556(uuid,text,uuid) to service_role;

create or replace function public.complete_background_job_v556(
  p_job_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_result jsonb
)
returns public.background_jobs
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare job public.background_jobs%rowtype;
begin
  update public.background_jobs
     set status='completed',result=coalesce(p_result,'{}'::jsonb),completed_at=now(),
         lease_expires_at=null,lease_token=null,worker_id=null,updated_at=now()
   where id=p_job_id and status='running' and worker_id=p_worker_id and lease_token=p_lease_token
  returning * into job;
  if not found then raise exception 'JOB_LEASE_LOST'; end if;
  insert into public.background_job_events(tenant_id,job_id,event_type,details)
  values(job.tenant_id,job.id,'completed',jsonb_build_object('worker_id',p_worker_id,'attempt',job.attempts));
  return job;
end $$;
revoke all on function public.complete_background_job_v556(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.complete_background_job_v556(uuid,text,uuid,jsonb) to service_role;

create or replace function public.fail_background_job_v556(
  p_job_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_error_code text,
  p_error_message text
)
returns public.background_jobs
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare job public.background_jobs%rowtype;
begin
  update public.background_jobs
     set status=case when attempts>=max_attempts then 'dead_letter' else 'queued' end,
         error_code=left(coalesce(p_error_code,'JOB_FAILED'),120),
         error_message=left(coalesce(p_error_message,'Falha no processamento.'),2000),
         run_after=case when attempts>=max_attempts then run_after else now()+make_interval(secs=>least(3600,power(2,attempts)::integer*30)) end,
         completed_at=case when attempts>=max_attempts then now() else null end,
         lease_expires_at=null,lease_token=null,worker_id=null,updated_at=now()
   where id=p_job_id and status='running' and worker_id=p_worker_id and lease_token=p_lease_token
  returning * into job;
  if not found then raise exception 'JOB_LEASE_LOST'; end if;
  insert into public.background_job_events(tenant_id,job_id,event_type,details)
  values(job.tenant_id,job.id,
    case when job.status='dead_letter' then 'dead_letter' else 'retry_scheduled' end,
    jsonb_build_object('error_code',job.error_code,'attempt',job.attempts,'worker_id',p_worker_id));
  return job;
end $$;
revoke all on function public.fail_background_job_v556(uuid,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.fail_background_job_v556(uuid,text,uuid,text,text) to service_role;

insert into public.nexponto_schema_versions(version,notes)
values('5.5.6','Final auth/admin membership sync, no-MFA bootstrap, lease-token jobs and production readiness hardening')
on conflict(version) do nothing;

commit;
