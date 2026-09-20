-- NexPonto v5.5.2 — estabilidade de autenticação, cadastros e remediação.
-- Incremental, idempotente, não destrutiva e segura para reexecução.

-- O campo legado é preservado por compatibilidade de schema, mas permanece
-- desativado. O fluxo operacional usa e-mail + senha para todos os perfis.
alter table public.platform_superadmins alter column mfa_required set default false;
update public.platform_superadmins set mfa_required=false where mfa_required is distinct from false;
alter table public.tenants alter column default_timezone set default 'America/Fortaleza';
alter table public.branches alter column timezone set default 'America/Fortaleza';

-- Auditoria de tentativas administrativas sem armazenar e-mail ou IP em claro.
create table if not exists public.admin_login_attempts (
  id uuid primary key default gen_random_uuid(),
  email_hash text not null,
  ip_hash text not null,
  success boolean not null,
  error_code text,
  request_id text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_admin_login_attempts_account_window_v552
  on public.admin_login_attempts(email_hash,created_at desc);
create index if not exists idx_admin_login_attempts_ip_window_v552
  on public.admin_login_attempts(ip_hash,created_at desc);
alter table public.admin_login_attempts enable row level security;
revoke all on table public.admin_login_attempts from public,anon,authenticated;
grant select,insert,delete on table public.admin_login_attempts to service_role;

-- API canônica consumida por policies. A versão v54 continua disponível apenas
-- como compatibilidade para bancos que já a referenciam.
create or replace function public.has_tenant_permission(p_tenant_id uuid,p_permission text)
returns boolean language sql stable security definer
set search_path=public,auth,pg_temp as $$
  select exists(
    select 1
    from public.tenant_memberships tm
    where tm.tenant_id=p_tenant_id
      and tm.auth_user_id=auth.uid()
      and tm.active
      and (
        '*'=any(coalesce(tm.permissions,'{}'::text[]))
        or p_permission=any(coalesce(tm.permissions,'{}'::text[]))
        or tm.role in ('tenant_owner','tenant_admin','master_admin','admin_geral')
      )
  )
$$;
revoke all on function public.has_tenant_permission(uuid,text) from public,anon;
grant execute on function public.has_tenant_permission(uuid,text) to authenticated,service_role;

create or replace function public.has_tenant_permission_v54(p_tenant_id uuid,p_permission text)
returns boolean language sql stable security definer
set search_path=public,auth,pg_temp as $$
  select public.has_tenant_permission(p_tenant_id,p_permission)
$$;
revoke all on function public.has_tenant_permission_v54(uuid,text) from public,anon;
grant execute on function public.has_tenant_permission_v54(uuid,text) to authenticated,service_role;

-- Chave persistente de criação: uma repetição após timeout devolve o mesmo
-- funcionário, sem duplicar cadastro, salário ou escala.
alter table public.employees add column if not exists creation_request_id uuid;
create unique index if not exists uq_employees_tenant_creation_request_v552
  on public.employees(tenant_id,creation_request_id)
  where creation_request_id is not null;

create or replace function public.upsert_employee_v552(
  p_tenant_id uuid,
  p_employee_id uuid,
  p_payload jsonb,
  p_pin_hash text,
  p_salary_effective_from date,
  p_schedule_effective_from date,
  p_reason text,
  p_actor_user_id uuid,
  p_membership_id uuid,
  p_request_id uuid
)
returns public.employees
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare employee public.employees%rowtype;
begin
  if p_tenant_id is null or p_actor_user_id is null then raise exception 'TENANT_AND_ACTOR_REQUIRED'; end if;
  if p_employee_id is null and p_request_id is null then raise exception 'CREATION_REQUEST_ID_REQUIRED'; end if;

  if p_employee_id is null then
    perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':'||p_request_id::text,0));
    select * into employee
    from public.employees
    where tenant_id=p_tenant_id and creation_request_id=p_request_id;
    if found then return employee; end if;
  end if;

  select * into employee from public.upsert_employee_v4(
    p_tenant_id,p_employee_id,p_payload,p_pin_hash,p_salary_effective_from,
    p_schedule_effective_from,p_reason,p_actor_user_id,p_membership_id
  );
  if p_employee_id is null then
    update public.employees
      set creation_request_id=p_request_id
      where id=employee.id and tenant_id=p_tenant_id
      returning * into employee;
  end if;
  return employee;
end $$;
revoke all on function public.upsert_employee_v552(uuid,uuid,jsonb,text,date,date,text,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.upsert_employee_v552(uuid,uuid,jsonb,text,date,date,text,uuid,uuid,uuid) to service_role;

-- Reconciliação conservadora: somente liga registros equivalentes ou cria o
-- lado ausente com a role já existente. Nunca promove um usuário a master.
create table if not exists public.admin_membership_reconciliation_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete set null,
  action text not null,
  affected_count integer not null default 0,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.admin_membership_reconciliation_logs enable row level security;
revoke all on table public.admin_membership_reconciliation_logs from public,anon,authenticated;
grant select,insert on table public.admin_membership_reconciliation_logs to service_role;

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

-- Buckets privados esperados pelos exports. Nenhum arquivo existente é tocado.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values
  ('exports','exports',false,52428800,array['application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/csv']),
  ('payroll-exports','payroll-exports',false,52428800,array['application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/csv'])
on conflict(id) do update set public=false;

insert into public.nexponto_schema_versions(version,notes)
values('5.5.2','Estabilidade de login, reconciliação administrativa e cadastros idempotentes')
on conflict(version) do nothing;
