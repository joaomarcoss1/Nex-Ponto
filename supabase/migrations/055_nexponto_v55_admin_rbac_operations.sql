-- NexPonto v5.5 - Admin/membership reconciliation, RBAC hardening, retention and indexes.
-- Idempotent and non-destructive: no historical rows are silently deleted.

alter table public.admin_users
  add column if not exists deactivated_at timestamptz,
  add column if not exists reactivated_at timestamptz;

create table if not exists public.admin_membership_reconciliation_audit (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  admin_user_id uuid references public.admin_users(id) on delete set null,
  membership_id uuid references public.tenant_memberships(id) on delete set null,
  issue_type text not null,
  action_taken text not null,
  before_snapshot jsonb not null default '{}'::jsonb,
  after_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.admin_membership_reconciliation_audit enable row level security;
drop policy if exists admin_membership_reconciliation_read on public.admin_membership_reconciliation_audit;
create policy admin_membership_reconciliation_read on public.admin_membership_reconciliation_audit
for select to authenticated
using (
  public.is_platform_superadmin()
  or public.has_tenant_permission(tenant_id, 'administrators.manage')
  or public.has_tenant_permission(tenant_id, 'audit.view')
);

create index if not exists idx_admin_membership_reconciliation_tenant_created
  on public.admin_membership_reconciliation_audit(tenant_id, created_at desc);

create or replace function public.reconcile_admin_memberships_v55()
returns table(issue_type text, affected_id uuid, action_taken text)
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_row public.admin_users%rowtype;
  membership_row public.tenant_memberships%rowtype;
begin
  for admin_row in
    select * from public.admin_users
    where tenant_id is not null and auth_user_id is not null
  loop
    select * into membership_row
    from public.tenant_memberships
    where tenant_id = admin_row.tenant_id and auth_user_id = admin_row.auth_user_id
    for update;

    if not found then
      insert into public.tenant_memberships(
        tenant_id, auth_user_id, admin_user_id, role, permissions, branch_ids, active, accepted_at
      ) values (
        admin_row.tenant_id,
        admin_row.auth_user_id,
        admin_row.id,
        admin_row.role::text,
        case when admin_row.role::text in ('master_admin','tenant_owner','admin_geral','tenant_admin') then array['*']::text[] else '{}'::text[] end,
        coalesce(admin_row.allowed_branch_ids, '{}'::uuid[]),
        admin_row.active,
        case when admin_row.active then now() else null end
      )
      returning * into membership_row;

      insert into public.admin_membership_reconciliation_audit(
        tenant_id, admin_user_id, membership_id, issue_type, action_taken, before_snapshot, after_snapshot
      ) values (
        admin_row.tenant_id, admin_row.id, membership_row.id, 'admin_without_membership', 'membership_created',
        to_jsonb(admin_row), to_jsonb(membership_row)
      );
      issue_type := 'admin_without_membership';
      affected_id := admin_row.id;
      action_taken := 'membership_created';
      return next;
    elsif membership_row.admin_user_id is distinct from admin_row.id
       or membership_row.role is distinct from admin_row.role::text
       or membership_row.active is distinct from admin_row.active
       or coalesce(membership_row.branch_ids, '{}'::uuid[]) is distinct from coalesce(admin_row.allowed_branch_ids, '{}'::uuid[]) then
      update public.tenant_memberships
      set admin_user_id = admin_row.id,
          role = admin_row.role::text,
          branch_ids = coalesce(admin_row.allowed_branch_ids, '{}'::uuid[]),
          active = admin_row.active,
          updated_at = now()
      where id = membership_row.id
      returning * into membership_row;

      insert into public.admin_membership_reconciliation_audit(
        tenant_id, admin_user_id, membership_id, issue_type, action_taken, before_snapshot, after_snapshot
      ) values (
        admin_row.tenant_id, admin_row.id, membership_row.id, 'admin_membership_drift', 'membership_updated',
        jsonb_build_object('admin', to_jsonb(admin_row)), to_jsonb(membership_row)
      );
      issue_type := 'admin_membership_drift';
      affected_id := admin_row.id;
      action_taken := 'membership_updated';
      return next;
    end if;
  end loop;

  for membership_row in
    select * from public.tenant_memberships tm
    where tm.admin_user_id is not null
      and not exists(select 1 from public.admin_users au where au.id = tm.admin_user_id and au.tenant_id = tm.tenant_id)
  loop
    insert into public.admin_membership_reconciliation_audit(
      tenant_id, admin_user_id, membership_id, issue_type, action_taken, before_snapshot, after_snapshot
    ) values (
      membership_row.tenant_id, membership_row.admin_user_id, membership_row.id,
      'membership_without_matching_admin', 'audit_only', to_jsonb(membership_row), '{}'::jsonb
    );
    issue_type := 'membership_without_matching_admin';
    affected_id := membership_row.id;
    action_taken := 'audit_only';
    return next;
  end loop;
end;
$$;

create or replace function public.create_tenant_admin_v55(
  p_actor_user_id uuid,
  p_tenant_id uuid,
  p_auth_user_id uuid,
  p_email text,
  p_full_name text,
  p_role text,
  p_branch_id uuid default null,
  p_branch_ids uuid[] default '{}'::uuid[],
  p_permissions text[] default '{}'::text[],
  p_can_view_financial_data boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_row public.admin_users%rowtype;
  membership_row public.tenant_memberships%rowtype;
  normalized_email text := lower(trim(p_email));
  normalized_branches uuid[] := coalesce(p_branch_ids, '{}'::uuid[]);
begin
  if not exists (
    select 1 from public.tenant_memberships tm
    where tm.tenant_id = p_tenant_id
      and tm.auth_user_id = p_actor_user_id
      and tm.active
      and (
        coalesce(tm.permissions, '{}'::text[]) @> array['*']::text[]
        or coalesce(tm.permissions, '{}'::text[]) @> array['administrators.manage']::text[]
        or tm.role in ('tenant_owner','tenant_admin','master_admin','admin_geral')
      )
  ) and not exists (
    select 1 from public.platform_superadmins ps
    where ps.auth_user_id = p_actor_user_id and ps.active
  ) then
    raise exception 'PERMISSION_DENIED';
  end if;
  if p_branch_id is not null and not p_branch_id = any(normalized_branches) then
    normalized_branches := array_append(normalized_branches, p_branch_id);
  end if;

  insert into public.admin_users(
    tenant_id, auth_user_id, email, full_name, role, branch_id, allowed_branch_ids,
    can_view_financial_data, active
  ) values (
    p_tenant_id, p_auth_user_id, normalized_email, trim(p_full_name), p_role::public.admin_role,
    p_branch_id, normalized_branches, p_can_view_financial_data, true
  )
  on conflict (tenant_id, lower(email)) do update
    set auth_user_id = excluded.auth_user_id,
        full_name = excluded.full_name,
        role = excluded.role,
        branch_id = excluded.branch_id,
        allowed_branch_ids = excluded.allowed_branch_ids,
        can_view_financial_data = excluded.can_view_financial_data,
        active = true,
        reactivated_at = case when public.admin_users.active = false then now() else public.admin_users.reactivated_at end,
        updated_at = now()
  returning * into admin_row;

  insert into public.tenant_memberships(
    tenant_id, auth_user_id, admin_user_id, role, permissions, branch_ids, active, invited_at
  ) values (
    p_tenant_id, p_auth_user_id, admin_row.id, p_role, coalesce(p_permissions, '{}'::text[]), normalized_branches, true, now()
  )
  on conflict (tenant_id, auth_user_id) do update
    set admin_user_id = excluded.admin_user_id,
        role = excluded.role,
        permissions = excluded.permissions,
        branch_ids = excluded.branch_ids,
        active = true,
        updated_at = now()
  returning * into membership_row;

  insert into public.audit_logs(tenant_id, user_email, action, entity, entity_id, new_data)
  values(
    p_tenant_id,
    coalesce((select email from auth.users where id = p_actor_user_id), 'system'),
    'create_tenant_admin_v55',
    'admin_users',
    admin_row.id::text,
    jsonb_build_object('admin', to_jsonb(admin_row)-'pin_hash', 'membership', to_jsonb(membership_row))
  );

  return jsonb_build_object('admin', to_jsonb(admin_row)-'pin_hash', 'membership', to_jsonb(membership_row));
end;
$$;

create or replace function public.update_tenant_admin_v55(
  p_actor_user_id uuid,
  p_tenant_id uuid,
  p_admin_user_id uuid,
  p_full_name text,
  p_role text,
  p_branch_id uuid default null,
  p_branch_ids uuid[] default '{}'::uuid[],
  p_permissions text[] default '{}'::text[],
  p_can_view_financial_data boolean default false,
  p_active boolean default true,
  p_auth_user_id uuid default null,
  p_email text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_row public.admin_users%rowtype;
  membership_row public.tenant_memberships%rowtype;
  normalized_branches uuid[] := coalesce(p_branch_ids, '{}'::uuid[]);
begin
  if not exists (
    select 1 from public.tenant_memberships tm
    where tm.tenant_id = p_tenant_id
      and tm.auth_user_id = p_actor_user_id
      and tm.active
      and (
        coalesce(tm.permissions, '{}'::text[]) @> array['*']::text[]
        or coalesce(tm.permissions, '{}'::text[]) @> array['administrators.manage']::text[]
        or tm.role in ('tenant_owner','tenant_admin','master_admin','admin_geral')
      )
  ) and not exists (
    select 1 from public.platform_superadmins ps
    where ps.auth_user_id = p_actor_user_id and ps.active
  ) then
    raise exception 'PERMISSION_DENIED';
  end if;
  if p_branch_id is not null and not p_branch_id = any(normalized_branches) then
    normalized_branches := array_append(normalized_branches, p_branch_id);
  end if;

  update public.admin_users
  set auth_user_id = coalesce(p_auth_user_id, auth_user_id),
      email = coalesce(nullif(lower(trim(p_email)), ''), email),
      full_name = trim(p_full_name),
      role = p_role::public.admin_role,
      branch_id = p_branch_id,
      allowed_branch_ids = normalized_branches,
      can_view_financial_data = p_can_view_financial_data,
      active = p_active,
      deactivated_at = case when p_active = false and active = true then now() else deactivated_at end,
      reactivated_at = case when p_active = true and active = false then now() else reactivated_at end,
      updated_at = now()
  where id = p_admin_user_id and tenant_id = p_tenant_id
  returning * into admin_row;

  if not found then raise exception 'ADMIN_NOT_FOUND'; end if;

  update public.tenant_memberships
  set role = p_role,
      permissions = coalesce(p_permissions, '{}'::text[]),
      branch_ids = normalized_branches,
      active = p_active,
      updated_at = now()
  where tenant_id = p_tenant_id and admin_user_id = admin_row.id
  returning * into membership_row;

  if not found then
    insert into public.tenant_memberships(tenant_id, auth_user_id, admin_user_id, role, permissions, branch_ids, active, accepted_at)
    values(p_tenant_id, admin_row.auth_user_id, admin_row.id, p_role, coalesce(p_permissions, '{}'::text[]), normalized_branches, p_active, case when p_active then now() else null end)
    returning * into membership_row;
  end if;

  insert into public.audit_logs(tenant_id, user_email, action, entity, entity_id, new_data)
  values(
    p_tenant_id,
    coalesce((select email from auth.users where id = p_actor_user_id), 'system'),
    'update_tenant_admin_v55',
    'admin_users',
    admin_row.id::text,
    jsonb_build_object('admin', to_jsonb(admin_row)-'pin_hash', 'membership', to_jsonb(membership_row))
  );

  return jsonb_build_object('admin', to_jsonb(admin_row)-'pin_hash', 'membership', to_jsonb(membership_row));
end;
$$;

create or replace function public.disable_tenant_admin_v55(
  p_actor_user_id uuid,
  p_tenant_id uuid,
  p_admin_user_id uuid,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.update_tenant_admin_v55(
    p_actor_user_id, p_tenant_id, p_admin_user_id,
    (select full_name from public.admin_users where id = p_admin_user_id),
    (select role::text from public.admin_users where id = p_admin_user_id),
    (select branch_id from public.admin_users where id = p_admin_user_id),
    (select allowed_branch_ids from public.admin_users where id = p_admin_user_id),
    '{}'::text[],
    (select can_view_financial_data from public.admin_users where id = p_admin_user_id),
    false
  );
end;
$$;

create or replace function public.reactivate_tenant_admin_v55(
  p_actor_user_id uuid,
  p_tenant_id uuid,
  p_admin_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.update_tenant_admin_v55(
    p_actor_user_id, p_tenant_id, p_admin_user_id,
    (select full_name from public.admin_users where id = p_admin_user_id),
    (select role::text from public.admin_users where id = p_admin_user_id),
    (select branch_id from public.admin_users where id = p_admin_user_id),
    (select allowed_branch_ids from public.admin_users where id = p_admin_user_id),
    '{}'::text[],
    (select can_view_financial_data from public.admin_users where id = p_admin_user_id),
    true
  );
end;
$$;

select * from public.reconcile_admin_memberships_v55();

create index if not exists idx_time_entries_tenant_branch_date_status_v55
  on public.time_entries(tenant_id, branch_id, entry_date desc, status);
create index if not exists idx_time_entries_tenant_employee_timestamp_v55
  on public.time_entries(tenant_id, employee_id, entry_timestamp desc);
create index if not exists idx_payroll_items_tenant_period_employee_v55
  on public.payroll_items(tenant_id, payroll_period_id, employee_id);
create index if not exists idx_hour_bank_tenant_employee_date_v55
  on public.hour_bank_movements(tenant_id, employee_id, movement_date desc);
create index if not exists idx_authorized_devices_tenant_status_used_v55
  on public.authorized_devices(tenant_id, status, last_used_at desc);
create index if not exists idx_absence_justifications_tenant_scan_v55
  on public.absence_justifications(tenant_id, attachment_scan_status, created_at desc)
  where attachment_path is not null;
create index if not exists idx_rate_limits_updated_v55
  on public.distributed_rate_limits(updated_at);
create index if not exists idx_pin_attempt_logs_created_v55
  on public.pin_attempt_logs(created_at);
create index if not exists idx_clock_attempts_created_v55
  on public.clock_attempts(attempted_at);
create index if not exists idx_clock_risk_events_created_v55
  on public.clock_risk_events(created_at);

create or replace function public.cleanup_operational_data_v55(
  p_rate_limit_days integer default 14,
  p_pin_attempt_days integer default 180,
  p_clock_attempt_days integer default 400,
  p_risk_event_days integer default 730,
  p_pending_device_days integer default 30,
  p_revoked_device_days integer default 730
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_rate_limits integer := 0;
  deleted_pin_attempts integer := 0;
  deleted_clock_attempts integer := 0;
  deleted_risk_events integer := 0;
  marked_devices integer := 0;
begin
  delete from public.distributed_rate_limits
  where updated_at < now() - make_interval(days => p_rate_limit_days);
  get diagnostics deleted_rate_limits = row_count;

  delete from public.pin_attempt_logs
  where created_at < now() - make_interval(days => p_pin_attempt_days);
  get diagnostics deleted_pin_attempts = row_count;

  delete from public.clock_attempts
  where attempted_at < now() - make_interval(days => p_clock_attempt_days)
    and resolved_time_entry_id is null;
  get diagnostics deleted_clock_attempts = row_count;

  delete from public.clock_risk_events
  where created_at < now() - make_interval(days => p_risk_event_days)
    and resolution_status in ('resolved','dismissed');
  get diagnostics deleted_risk_events = row_count;

  update public.authorized_devices
  set status = 'revoked',
      revoked_at = coalesce(revoked_at, now()),
      revocation_reason = coalesce(revocation_reason, 'Limpeza operacional v5.5: dispositivo pendente expirado')
  where status = 'pending'
    and created_at < now() - make_interval(days => p_pending_device_days);
  get diagnostics marked_devices = row_count;

  return jsonb_build_object(
    'deleted_rate_limits', deleted_rate_limits,
    'deleted_pin_attempts', deleted_pin_attempts,
    'deleted_clock_attempts', deleted_clock_attempts,
    'deleted_risk_events', deleted_risk_events,
    'revoked_pending_devices', marked_devices,
    'revoked_device_retention_days', p_revoked_device_days
  );
end;
$$;

insert into public.schema_migrations(version, notes)
values('5.5.0', 'Production hardening: admin-membership reconciliation, RBAC matrix, operational retention and performance indexes')
on conflict (version) do update set notes = excluded.notes, applied_at = now();
