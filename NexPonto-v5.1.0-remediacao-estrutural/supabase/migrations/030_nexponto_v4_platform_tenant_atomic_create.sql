-- NexPonto v4 — criação atômica de empresa, proprietário, assinatura e onboarding
-- após o usuário de Auth ter sido convidado/criado pela administração da plataforma.

create or replace function public.create_tenant_with_owner_v4(
  p_actor_user_id uuid,
  p_auth_user_id uuid,
  p_owner_email text,
  p_owner_name text,
  p_legal_name text,
  p_display_name text,
  p_slug text,
  p_timezone text default 'America/Fortaleza',
  p_plan_code text default 'professional'
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  plan_row public.subscription_plans%rowtype;
  tenant_row public.tenants%rowtype;
  admin_row public.admin_users%rowtype;
  membership_row public.tenant_memberships%rowtype;
begin
  if not exists (
    select 1 from public.platform_superadmins
    where auth_user_id=p_actor_user_id and active
  ) then raise exception 'PLATFORM_PERMISSION_DENIED'; end if;
  if p_auth_user_id is null then raise exception 'AUTH_USER_REQUIRED'; end if;
  if p_owner_email is null or position('@' in p_owner_email) < 2 then raise exception 'VALID_EMAIL_REQUIRED'; end if;
  if length(trim(coalesce(p_owner_name,''))) < 3 then raise exception 'OWNER_NAME_REQUIRED'; end if;
  if length(trim(coalesce(p_legal_name,''))) < 3 then raise exception 'LEGAL_NAME_REQUIRED'; end if;
  if length(trim(coalesce(p_display_name,''))) < 2 then raise exception 'DISPLAY_NAME_REQUIRED'; end if;
  if p_slug !~ '^[a-z0-9][a-z0-9-]{1,62}$' then raise exception 'INVALID_TENANT_SLUG'; end if;

  select * into plan_row
  from public.subscription_plans
  where code=p_plan_code and active
  limit 1;
  if not found then raise exception 'SUBSCRIPTION_PLAN_NOT_FOUND'; end if;
  if exists(select 1 from public.tenants where slug=p_slug) then raise exception 'TENANT_SLUG_ALREADY_USED'; end if;

  insert into public.tenants(
    slug,legal_name,display_name,status,onboarding_status,default_timezone,
    plan_id,contact_email,public_access_code
  ) values (
    p_slug,trim(p_legal_name),trim(p_display_name),'onboarding','in_progress',
    coalesce(nullif(trim(p_timezone),''),'America/Fortaleza'),plan_row.id,
    lower(trim(p_owner_email)),encode(gen_random_bytes(12),'hex')
  ) returning * into tenant_row;

  insert into public.admin_users(
    tenant_id,auth_user_id,email,full_name,role,active,allowed_branch_ids,can_view_financial_data
  ) values (
    tenant_row.id,p_auth_user_id,lower(trim(p_owner_email)),trim(p_owner_name),
    'tenant_owner',true,'{}'::uuid[],true
  ) returning * into admin_row;

  insert into public.tenant_memberships(
    tenant_id,auth_user_id,admin_user_id,role,permissions,branch_ids,active,invited_at
  ) values (
    tenant_row.id,p_auth_user_id,admin_row.id,'tenant_owner',array['*'],'{}'::uuid[],true,now()
  ) returning * into membership_row;

  insert into public.tenant_subscriptions(tenant_id,plan_id,status,starts_at)
  values(tenant_row.id,plan_row.id,'trialing',now());

  insert into public.tenant_branding(tenant_id,app_name,short_name,tagline,report_footer,updated_by)
  values(tenant_row.id,'NexPonto','NexPonto','Gestão inteligente de jornadas','Relatório gerado pelo NexPonto',p_actor_user_id);

  insert into public.tenant_settings(tenant_id,key,value,updated_by)
  values
    (tenant_row.id,'outside_operating_hours_policy','"require_justification"'::jsonb,p_actor_user_id),
    (tenant_row.id,'onboarding_owner_membership_id',to_jsonb(membership_row.id::text),p_actor_user_id);

  insert into public.tenant_onboarding_steps(tenant_id,step_key,status)
  select tenant_row.id,step_key,case when step_key='company' then 'completed' else 'pending' end
  from unnest(array['company','branding','first_branch','operating_hours','clock_policy','admin_team','gps_test','qr_test','activation']) step_key;

  insert into public.tenant_features(tenant_id,feature_key,enabled,configuration)
  values(tenant_row.id,'offline_clock',false,'{"status":"disabled_pending_homologation"}'::jsonb)
  on conflict (tenant_id,feature_key) do update set enabled=false,configuration=excluded.configuration,updated_at=now();

  insert into public.platform_audit_logs(actor_user_id,tenant_id,action,resource_type,resource_id,metadata)
  values(
    p_actor_user_id,tenant_row.id,'tenant_created','tenant',tenant_row.id::text,
    jsonb_build_object('slug',tenant_row.slug,'plan',plan_row.code,'owner_email',lower(trim(p_owner_email)))
  );

  return jsonb_build_object(
    'tenant',to_jsonb(tenant_row),
    'admin',to_jsonb(admin_row)-'pin_hash',
    'membership',to_jsonb(membership_row),
    'plan',jsonb_build_object('id',plan_row.id,'code',plan_row.code,'name',plan_row.name)
  );
end;
$$;

revoke all on function public.create_tenant_with_owner_v4(uuid,uuid,text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.create_tenant_with_owner_v4(uuid,uuid,text,text,text,text,text,text,text) to service_role;
