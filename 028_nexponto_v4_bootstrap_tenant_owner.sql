-- NexPonto v4 — bootstrap atômico da primeira empresa e proprietário.

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
    values(p_auth_user_id,lower(trim(p_email)),trim(p_full_name),true,true)
    on conflict (auth_user_id) do update
      set email=excluded.email,full_name=excluded.full_name,active=true,mfa_required=true,updated_at=now();
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
