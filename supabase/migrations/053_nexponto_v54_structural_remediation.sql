-- NexPonto v5.4 — remediação incremental, idempotente e não destrutiva.
-- Preserva todas as migrations e dados anteriores.

-- 1. Normaliza tenant_features; configuration é canônica e config permanece
-- como compatibilidade temporária para instalações v3/v4.
alter table public.tenant_features add column if not exists config jsonb not null default '{}'::jsonb;
alter table public.tenant_features add column if not exists configuration jsonb not null default '{}'::jsonb;

update public.tenant_features
set configuration = case
  when configuration = '{}'::jsonb and config <> '{}'::jsonb then config
  else configuration
end;
update public.tenant_features set config = configuration where config is distinct from configuration;

create or replace function public.sync_tenant_feature_configuration_v54()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='INSERT' then
    new.configuration := coalesce(nullif(new.configuration,'{}'::jsonb),new.config,'{}'::jsonb);
  elsif new.configuration is not distinct from old.configuration and new.config is distinct from old.config then
    new.configuration := coalesce(new.config,'{}'::jsonb);
  end if;
  new.config := coalesce(new.configuration,'{}'::jsonb);
  return new;
end $$;

drop trigger if exists trg_tenant_features_configuration_v54 on public.tenant_features;
create trigger trg_tenant_features_configuration_v54
before insert or update of config,configuration on public.tenant_features
for each row execute function public.sync_tenant_feature_configuration_v54();

-- 2. Estado persistente e recuperável de convite/onboarding.
alter table public.tenant_memberships add column if not exists invite_status text not null default 'pending';
alter table public.tenant_memberships add column if not exists invite_sent_at timestamptz;
alter table public.tenant_memberships add column if not exists invite_error text;
alter table public.tenant_memberships add column if not exists invite_attempts integer not null default 0;

do $$ begin
  alter table public.tenant_memberships
    add constraint tenant_memberships_invite_status_v54
    check (invite_status in ('pending','sent','accepted','failed','not_required')) not valid;
exception when duplicate_object then null; end $$;

update public.tenant_memberships
set invite_status=case when accepted_at is not null then 'accepted' when invited_at is not null then 'sent' else invite_status end,
    invite_sent_at=coalesce(invite_sent_at,invited_at),
    invite_attempts=case when invited_at is not null and invite_attempts=0 then 1 else invite_attempts end;

create index if not exists idx_tenant_memberships_pending_invites_v54
on public.tenant_memberships(tenant_id,invite_status,updated_at desc)
where invite_status in ('pending','failed');

insert into public.tenant_onboarding_steps(tenant_id,step_key,status)
select t.id,s.step_key,'pending'
from public.tenants t
cross join unnest(array['company','branding','first_branch','operating_hours','clock_policy','admin_team','gps_test','qr_test','activation']) s(step_key)
on conflict(tenant_id,step_key) do nothing;

-- 3. Permissão canônica também no banco. Função não concede acesso à
-- plataforma; somente a membership ativa do próprio tenant é considerada.
create or replace function public.has_tenant_permission_v54(p_tenant_id uuid,p_permission text)
returns boolean language sql stable security definer
set search_path=public,auth,pg_temp as $$
  select exists(
    select 1 from public.tenant_memberships tm
    where tm.tenant_id=p_tenant_id and tm.auth_user_id=auth.uid() and tm.active
      and (
        '*'=any(tm.permissions)
        or p_permission=any(tm.permissions)
        or tm.role in ('tenant_owner','tenant_admin','master_admin','admin_geral')
      )
  )
$$;
revoke all on function public.has_tenant_permission_v54(uuid,text) from public,anon;
grant execute on function public.has_tenant_permission_v54(uuid,text) to authenticated,service_role;

-- Escritas operacionais passam exclusivamente pelas APIs/RPCs validadas. A
-- service_role continua habilitada; usuários autenticados não alteram tabelas
-- diretamente pelo PostgREST, mesmo se uma policy antiga for permissiva.
do $$ declare t text; begin
  foreach t in array array[
    'admin_users','branches','employees','employee_salary_history','work_schedules',
    'employee_branch_authorizations','holidays','time_entries','absence_justifications',
    'payroll_periods','payroll_items','overtime_reviews','branch_operating_hours',
    'shift_templates','shift_template_intervals','hour_bank_movements','shift_requests',
    'branch_qr_tokens','schedule_cycles','schedule_cycle_days','schedule_publications',
    'schedule_occurrences','coverage_requirements','tenant_settings','tenant_branding',
    'tenant_features','tenant_subscriptions','tenant_onboarding_steps'
  ] loop
    if to_regclass('public.'||t) is not null then
      execute format('revoke insert,update,delete,truncate on table public.%I from authenticated',t);
    end if;
  end loop;
end $$;

-- Leitura financeira exige permissão financeira além do tenant/filial.
do $$ declare t text; p record; begin
  foreach t in array array['employee_salary_history','payroll_periods','payroll_items','payroll_calculation_runs','payroll_calculation_items'] loop
    if to_regclass('public.'||t) is null then continue; end if;
    for p in select policyname from pg_policies where schemaname='public' and tablename=t and cmd='SELECT' loop
      execute format('drop policy if exists %I on public.%I',p.policyname,t);
    end loop;
    execute format(
      'create policy financial_read_v54 on public.%I for select to authenticated using (tenant_id=public.current_tenant_id() and public.has_tenant_permission_v54(tenant_id,''payroll.view''))',t
    );
  end loop;
end $$;

-- 4. Storage privado isolado pelo primeiro segmento tenant_id.
drop policy if exists "admins read justification files" on storage.objects;
drop policy if exists "admins manage justification files" on storage.objects;
drop policy if exists justification_tenant_read_v54 on storage.objects;
drop policy if exists justification_tenant_insert_v54 on storage.objects;
drop policy if exists justification_tenant_update_v54 on storage.objects;
drop policy if exists justification_tenant_delete_v54 on storage.objects;

create policy justification_tenant_read_v54 on storage.objects for select to authenticated
using (
  bucket_id='justificativas'
  and (storage.foldername(name))[1]=public.current_tenant_id()::text
  and public.has_tenant_permission_v54(public.current_tenant_id(),'time_entry.review')
);
create policy justification_tenant_insert_v54 on storage.objects for insert to authenticated
with check (
  bucket_id='justificativas'
  and (storage.foldername(name))[1]=public.current_tenant_id()::text
  and public.has_tenant_permission_v54(public.current_tenant_id(),'time_entry.review')
);
create policy justification_tenant_update_v54 on storage.objects for update to authenticated
using (
  bucket_id='justificativas'
  and (storage.foldername(name))[1]=public.current_tenant_id()::text
  and public.has_tenant_permission_v54(public.current_tenant_id(),'time_entry.review')
) with check (
  bucket_id='justificativas'
  and (storage.foldername(name))[1]=public.current_tenant_id()::text
);
create policy justification_tenant_delete_v54 on storage.objects for delete to authenticated
using (
  bucket_id='justificativas'
  and (storage.foldername(name))[1]=public.current_tenant_id()::text
  and public.has_tenant_permission_v54(public.current_tenant_id(),'time_entry.review')
);

-- 5. Auditoria estrutural somente leitura para o script operacional.
create table if not exists public.nexponto_schema_versions(
  version text primary key,
  applied_at timestamptz not null default now(),
  notes text not null
);
insert into public.nexponto_schema_versions(version,notes)
values('5.4.0','Remediação estrutural, configuração, convite e hardening de acesso')
on conflict(version) do nothing;
revoke all on public.nexponto_schema_versions from anon,authenticated;

create or replace function public.audit_database_structure_v54()
returns jsonb language sql stable security definer
set search_path=public,storage,pg_catalog,pg_temp as $$
  select jsonb_build_object(
    'schemaVersion',(select max(version) from public.nexponto_schema_versions),
    'tables',(select coalesce(jsonb_agg(tablename order by tablename),'[]'::jsonb) from pg_tables where schemaname='public'),
    'functions',(select coalesce(jsonb_agg(proname order by proname),'[]'::jsonb) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'),
    'policies',(select coalesce(jsonb_agg(jsonb_build_object('schema',schemaname,'table',tablename,'name',policyname,'command',cmd)),'[]'::jsonb) from pg_policies where schemaname in ('public','storage')),
    'buckets',(select coalesce(jsonb_agg(id order by id),'[]'::jsonb) from storage.buckets),
    'tenantFeatureColumns',(select coalesce(jsonb_agg(column_name order by column_name),'[]'::jsonb) from information_schema.columns where table_schema='public' and table_name='tenant_features'),
    'rlsDisabled',(select coalesce(jsonb_agg(c.relname order by c.relname),'[]'::jsonb) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity and exists(select 1 from information_schema.columns x where x.table_schema='public' and x.table_name=c.relname and x.column_name='tenant_id'))
  )
$$;
revoke all on function public.audit_database_structure_v54() from public,anon,authenticated;
grant execute on function public.audit_database_structure_v54() to service_role;

comment on column public.tenant_features.configuration is 'Coluna canônica v5.4; config é compatibilidade temporária sincronizada por trigger.';
comment on function public.audit_database_structure_v54() is 'Inventário estrutural somente leitura; execução restrita à service_role.';
