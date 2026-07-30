-- NexPonto v5.3 - remediacao final para piloto controlado.
-- Migration incremental, sem DROP TABLE/TRUNCATE/reset e segura para bases populadas.

create extension if not exists pgcrypto;

create or replace function public.safe_uuid_v53(p_value text)
returns uuid
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  return nullif(p_value, '')::uuid;
exception when others then
  return null;
end $$;

create or replace function public.active_tenant_member_v53(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists(
    select 1
    from public.tenant_memberships tm
    join public.tenants t on t.id = tm.tenant_id
    where tm.tenant_id = p_tenant_id
      and tm.auth_user_id = auth.uid()
      and tm.active
      and t.status in ('trial','active')
  )
$$;

create or replace function public.has_permission_v53(p_tenant_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists(
    select 1
    from public.tenant_memberships tm
    where tm.tenant_id = p_tenant_id
      and tm.auth_user_id = auth.uid()
      and tm.active
      and (
        '*' = any(tm.permissions)
        or p_permission = any(tm.permissions)
        or (
          p_permission in ('employee.view','schedule.view','time_entry.view','justification.view','overtime.view','time_bank.view')
          and tm.role in ('tenant_owner','tenant_admin','rh_admin','rh_analyst','finance_admin','regional_manager','branch_manager','department_leader','master_admin','admin','admin_geral','gerente_filial','rh_financeiro')
        )
        or (
          p_permission in ('employee.manage','schedule.manage','time_entry.review','justification.review','overtime.review','time_bank.manage')
          and tm.role in ('tenant_owner','tenant_admin','rh_admin','rh_analyst','regional_manager','branch_manager','department_leader','master_admin','admin','admin_geral','gerente_filial','rh_financeiro')
        )
        or (
          p_permission like 'payroll.%'
          and tm.role in ('tenant_owner','payroll_manager','finance_admin','master_admin','rh_financeiro')
        )
        or (
          p_permission = 'reports.export'
          and tm.role in ('tenant_owner','tenant_admin','rh_admin','rh_analyst','finance_admin','regional_manager','branch_manager','master_admin','admin','admin_geral','gerente_filial','rh_financeiro')
        )
      )
  )
$$;

create or replace function public.can_access_branch_v53(p_tenant_id uuid, p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select p_branch_id is null or exists(
    select 1
    from public.tenant_memberships tm
    where tm.tenant_id = p_tenant_id
      and tm.auth_user_id = auth.uid()
      and tm.active
      and (
        tm.role in ('tenant_owner','tenant_admin','rh_admin','rh_analyst','finance_admin','regional_manager','master_admin','admin','admin_geral','rh_financeiro')
        or p_branch_id = any(tm.branch_ids)
        or exists (
          select 1
          from public.tenant_member_branches tmb
          where tmb.tenant_id = p_tenant_id
            and tmb.membership_id = tm.id
            and tmb.branch_id = p_branch_id
        )
      )
  )
$$;

create or replace function public.storage_object_tenant_v53(p_name text)
returns uuid
language sql
immutable
set search_path = public, pg_temp
as $$ select public.safe_uuid_v53(split_part(p_name, '/', 1)) $$;

create or replace function public.storage_object_entity_type_v53(p_name text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$ select split_part(p_name, '/', 2) $$;

create or replace function public.storage_object_entity_id_v53(p_name text)
returns uuid
language sql
immutable
set search_path = public, pg_temp
as $$ select public.safe_uuid_v53(split_part(p_name, '/', 3)) $$;

alter table public.absence_justifications
  add column if not exists attachment_scan_status text not null default 'not_required',
  add column if not exists attachment_scan_result jsonb not null default '{}'::jsonb,
  add column if not exists attachment_scanned_at timestamptz,
  add column if not exists attachment_download_count integer not null default 0,
  add column if not exists attachment_deleted_at timestamptz;

update public.absence_justifications
set attachment_scan_status = case attachment_scan_status
  when 'pending' then 'pending_scan'
  when 'error' then 'scan_failed'
  else attachment_scan_status
end
where attachment_scan_status in ('pending','error');

alter table public.absence_justifications
  drop constraint if exists absence_attachment_scan_status_v52,
  drop constraint if exists absence_attachment_scan_status_v53;

alter table public.absence_justifications
  add constraint absence_attachment_scan_status_v53
  check (attachment_scan_status in ('not_required','pending_scan','clean','infected','rejected','scan_failed')) not valid;

alter table public.background_jobs
  add column if not exists schema_version integer not null default 1,
  add column if not exists priority integer not null default 100,
  add column if not exists timeout_seconds integer not null default 900,
  add column if not exists heartbeat_interval_seconds integer not null default 60,
  add column if not exists expires_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references auth.users(id) on delete set null,
  add column if not exists safe_error jsonb not null default '{}'::jsonb;

alter table public.report_exports
  add column if not exists checksum_sha256 text,
  add column if not exists row_count integer,
  add column if not exists downloaded_count integer not null default 0,
  add column if not exists last_downloaded_at timestamptz;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('justificativas','justificativas',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf']),
  ('nexponto-branding','nexponto-branding',false,5242880,array['image/jpeg','image/png','image/webp']),
  ('exports','exports',false,52428800,array['text/csv','text/plain','application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']),
  ('payroll-exports','payroll-exports',false,52428800,array['text/csv','application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']),
  ('time-clock-receipts','time-clock-receipts',false,10485760,array['application/pdf','text/html','text/plain'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "admins read justification files" on storage.objects;
drop policy if exists "admins manage justification files" on storage.objects;
drop policy if exists storage_private_select_v53 on storage.objects;
drop policy if exists storage_private_insert_v53 on storage.objects;
drop policy if exists storage_private_update_v53 on storage.objects;
drop policy if exists storage_private_delete_v53 on storage.objects;

create policy storage_private_select_v53 on storage.objects
for select to authenticated
using (
  bucket_id in ('justificativas','nexponto-branding','exports','payroll-exports','time-clock-receipts')
  and public.storage_object_tenant_v53(name) = public.current_tenant_id()
  and public.active_tenant_member_v53(public.storage_object_tenant_v53(name))
  and (
    (
      bucket_id = 'justificativas'
      and public.storage_object_entity_type_v53(name) = 'justifications'
      and public.has_permission_v53(public.storage_object_tenant_v53(name), 'justification.view')
      and exists (
        select 1
        from public.absence_justifications aj
        where aj.id = public.storage_object_entity_id_v53(name)
          and aj.tenant_id = public.storage_object_tenant_v53(name)
          and aj.attachment_scan_status = 'clean'
          and public.can_access_branch_v53(aj.tenant_id, aj.branch_id)
      )
    )
    or (
      bucket_id = 'nexponto-branding'
      and public.storage_object_entity_type_v53(name) = 'branding'
      and public.has_permission_v53(public.storage_object_tenant_v53(name), 'branding.manage')
    )
    or (
      bucket_id in ('exports','payroll-exports')
      and public.storage_object_entity_type_v53(name) = 'exports'
      and public.has_permission_v53(public.storage_object_tenant_v53(name), 'reports.export')
    )
    or (
      bucket_id = 'time-clock-receipts'
      and public.storage_object_entity_type_v53(name) = 'receipts'
      and public.has_permission_v53(public.storage_object_tenant_v53(name), 'time_entry.view')
    )
  )
);

create policy storage_private_insert_v53 on storage.objects
for insert to authenticated
with check (
  bucket_id in ('justificativas','nexponto-branding','exports','payroll-exports','time-clock-receipts')
  and public.storage_object_tenant_v53(name) = public.current_tenant_id()
  and public.active_tenant_member_v53(public.storage_object_tenant_v53(name))
  and (
    (
      bucket_id = 'justificativas'
      and public.storage_object_entity_type_v53(name) = 'justifications'
      and public.has_permission_v53(public.storage_object_tenant_v53(name), 'justification.review')
      and exists (
        select 1
        from public.absence_justifications aj
        where aj.id = public.storage_object_entity_id_v53(name)
          and aj.tenant_id = public.storage_object_tenant_v53(name)
          and public.can_access_branch_v53(aj.tenant_id, aj.branch_id)
      )
    )
    or (
      bucket_id = 'nexponto-branding'
      and public.storage_object_entity_type_v53(name) = 'branding'
      and public.has_permission_v53(public.storage_object_tenant_v53(name), 'branding.manage')
    )
    or (
      bucket_id in ('exports','payroll-exports')
      and public.storage_object_entity_type_v53(name) = 'exports'
      and public.has_permission_v53(public.storage_object_tenant_v53(name), 'reports.export')
      and exists (
        select 1
        from public.background_jobs bj
        where bj.id = public.storage_object_entity_id_v53(name)
          and bj.tenant_id = public.storage_object_tenant_v53(name)
      )
    )
    or (
      bucket_id = 'time-clock-receipts'
      and public.storage_object_entity_type_v53(name) = 'receipts'
      and public.has_permission_v53(public.storage_object_tenant_v53(name), 'time_entry.review')
    )
  )
);

create policy storage_private_update_v53 on storage.objects
for update to authenticated
using (
  bucket_id in ('justificativas','nexponto-branding','exports','payroll-exports','time-clock-receipts')
  and public.storage_object_tenant_v53(name) = public.current_tenant_id()
  and public.active_tenant_member_v53(public.storage_object_tenant_v53(name))
)
with check (
  bucket_id in ('justificativas','nexponto-branding','exports','payroll-exports','time-clock-receipts')
  and public.storage_object_tenant_v53(name) = public.current_tenant_id()
  and public.active_tenant_member_v53(public.storage_object_tenant_v53(name))
  and (
    public.has_permission_v53(public.storage_object_tenant_v53(name), 'justification.review')
    or public.has_permission_v53(public.storage_object_tenant_v53(name), 'branding.manage')
    or public.has_permission_v53(public.storage_object_tenant_v53(name), 'reports.export')
  )
);

create policy storage_private_delete_v53 on storage.objects
for delete to authenticated
using (
  bucket_id in ('justificativas','nexponto-branding','exports','payroll-exports','time-clock-receipts')
  and public.storage_object_tenant_v53(name) = public.current_tenant_id()
  and public.active_tenant_member_v53(public.storage_object_tenant_v53(name))
  and (
    public.has_permission_v53(public.storage_object_tenant_v53(name), 'justification.review')
    or public.has_permission_v53(public.storage_object_tenant_v53(name), 'branding.manage')
    or public.has_permission_v53(public.storage_object_tenant_v53(name), 'reports.export')
  )
);

do $$
declare
  t text;
  critical_tables text[] := array[
    'admin_users','tenant_memberships','employees','employee_salary_history',
    'work_schedules','employee_branch_authorizations','time_entries',
    'work_sessions','work_session_events','time_entry_adjustments',
    'absence_justifications','overtime_reviews','hour_bank_movements',
    'payroll_periods','payroll_items','payroll_calculation_runs',
    'payroll_rubrics','payroll_item_rubrics','payroll_divergences',
    'payroll_approvals','payroll_state_transitions','audit_logs',
    'background_jobs','background_job_events','report_exports',
    'privacy_requests','tenant_lifecycle_requests','tenant_subscriptions'
  ];
begin
  foreach t in array critical_tables loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke insert, update, delete on table public.%I from authenticated', t);
    end if;
  end loop;
end $$;

revoke execute on function public.safe_uuid_v53(text) from public, anon;
revoke execute on function public.active_tenant_member_v53(uuid) from public, anon;
revoke execute on function public.has_permission_v53(uuid,text) from public, anon;
revoke execute on function public.can_access_branch_v53(uuid,uuid) from public, anon;
revoke execute on function public.storage_object_tenant_v53(text) from public, anon;
revoke execute on function public.storage_object_entity_type_v53(text) from public, anon;
revoke execute on function public.storage_object_entity_id_v53(text) from public, anon;

grant execute on function public.active_tenant_member_v53(uuid) to authenticated, service_role;
grant execute on function public.has_permission_v53(uuid,text) to authenticated, service_role;
grant execute on function public.can_access_branch_v53(uuid,uuid) to authenticated, service_role;
grant execute on function public.safe_uuid_v53(text) to authenticated, service_role;
grant execute on function public.storage_object_tenant_v53(text) to authenticated, service_role;
grant execute on function public.storage_object_entity_type_v53(text) to authenticated, service_role;
grant execute on function public.storage_object_entity_id_v53(text) to authenticated, service_role;

create index if not exists idx_absence_justifications_scan_v53
  on public.absence_justifications(tenant_id, attachment_scan_status, created_at desc)
  where attachment_path is not null;

create index if not exists idx_background_jobs_tenant_priority_v53
  on public.background_jobs(tenant_id, status, priority, run_after, created_at)
  where status in ('queued','running');

comment on function public.has_permission_v53(uuid,text) is
  'Mapeia permissao canonica por membership ativa, permissao explicita ou papeis legados compativeis.';
