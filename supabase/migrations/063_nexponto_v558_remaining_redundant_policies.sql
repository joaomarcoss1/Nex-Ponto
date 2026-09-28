-- v5.5.8 (part 3): finishes the "Multiple Permissive Policies" performance
-- advisor cleanup started in migration 062. Two of the three remaining
-- findings follow the exact same verified-safe shape (a FOR ALL write
-- policy whose condition is a strict subset of the paired FOR SELECT read
-- policy's condition, so it contributes nothing to SELECT beyond overhead):
--
--   clock_risk_events: clock_risk_tenant_write requires is_tenant_admin_member;
--     clock_risk_tenant_read requires is_tenant_admin_member OR the auditor role
--     — write's condition is strictly narrower.
--   tenant_branding: tenant_branding_admin_write requires is_tenant_admin_member
--     in addition to tenant match; tenant_branding_member_read only requires
--     tenant match — any tenant member can read branding by design (it's
--     shown on the login screen before authentication even resolves a role).
--
-- The third finding, employee_salary_history, is deliberately NOT touched
-- here: its write policy's condition (can_access_employee AND
-- is_tenant_admin_member) does not imply its read policy's condition
-- (has_tenant_permission_v54(tenant_id,'payroll.view')) — is_tenant_admin_member
-- is true for branch_manager/department_leader/regional_manager/gerente_filial
-- too, and nothing here confirms those roles are also granted 'payroll.view'.
-- Splitting this one the same way could quietly remove read access some
-- non-financial admin role currently has via the write policy — that's a
-- real access-control decision, not a performance no-op, and needs a human
-- product decision rather than an automated pattern match.

drop policy if exists "clock_risk_tenant_write" on public.clock_risk_events;
drop policy if exists "clock_risk_tenant_write_insert" on public.clock_risk_events;
create policy "clock_risk_tenant_write_insert" on public.clock_risk_events for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.is_tenant_admin_member(tenant_id));
drop policy if exists "clock_risk_tenant_write_update" on public.clock_risk_events;
create policy "clock_risk_tenant_write_update" on public.clock_risk_events for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_tenant_admin_member(tenant_id))
  with check (tenant_id = public.current_tenant_id() and public.is_tenant_admin_member(tenant_id));
drop policy if exists "clock_risk_tenant_write_delete" on public.clock_risk_events;
create policy "clock_risk_tenant_write_delete" on public.clock_risk_events for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_tenant_admin_member(tenant_id));

drop policy if exists "tenant_branding_admin_write" on public.tenant_branding;
drop policy if exists "tenant_branding_admin_write_insert" on public.tenant_branding;
create policy "tenant_branding_admin_write_insert" on public.tenant_branding for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.is_tenant_admin_member(tenant_id));
drop policy if exists "tenant_branding_admin_write_update" on public.tenant_branding;
create policy "tenant_branding_admin_write_update" on public.tenant_branding for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_tenant_admin_member(tenant_id))
  with check (tenant_id = public.current_tenant_id() and public.is_tenant_admin_member(tenant_id));
drop policy if exists "tenant_branding_admin_write_delete" on public.tenant_branding;
create policy "tenant_branding_admin_write_delete" on public.tenant_branding for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_tenant_admin_member(tenant_id));
