-- v5.5.8 (part 2): removes a redundant RLS policy evaluation, found via the
-- live Supabase performance advisor ("Multiple Permissive Policies", WARN,
-- 41 findings across public tables).
--
-- Two naming patterns exist in this schema, both with the same shape: a
-- `FOR SELECT` read policy, and a `FOR ALL` write policy whose condition is
-- always a strict subset of the read policy's condition (write requires
-- everything read requires, plus is_tenant_admin_member(tenant_id)). That
-- makes the write policy's contribution to SELECT pure overhead: Postgres
-- ORs every matching permissive policy together, so a table with both pays
-- for evaluating the write condition on every read even though it can never
-- grant a SELECT the read policy wasn't already granting.
--   - tenant_read (select) / tenant_write (all)               — migration 021
--   - tenant_branch_read (select) / tenant_branch_write (all) — later branch-scoped variant
--
-- This migration is schema-driven rather than a hardcoded table list: for
-- every table that currently has exactly one of these two pairs, it copies
-- that table's own existing tenant_*_write using/with-check clauses
-- verbatim (no clause text is invented here) into three command-scoped
-- policies (insert/update/delete — Postgres policies take exactly one
-- command each, so splitting is the only way to drop SELECT from an ALL
-- policy) and drops the original FOR ALL policy. Tables where the pattern
-- doesn't match exactly (financial tables with a lone read-only policy and
-- no write policy at all, e.g. payroll_items/payroll_periods; anything
-- customized differently) are left untouched.
do $$
declare
  pair record;
  write_pol record;
begin
  for pair in
    select distinct tablename, 'tenant' as prefix
    from pg_policies
    where schemaname = 'public' and policyname = 'tenant_write'
    union
    select distinct tablename, 'tenant_branch' as prefix
    from pg_policies
    where schemaname = 'public' and policyname = 'tenant_branch_write'
  loop
    -- Require the matching read policy to exist too, so we only ever touch
    -- a verified read+write pair, never a write-only policy on its own.
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = pair.tablename and policyname = pair.prefix || '_read'
    ) then
      continue;
    end if;

    select policyname, cmd, permissive, qual::text as using_expr, with_check::text as check_expr
      into write_pol
      from pg_policies
      where schemaname = 'public' and tablename = pair.tablename and policyname = pair.prefix || '_write';

    -- Only ever split a plain FOR ALL permissive policy — anything else is
    -- outside what this migration verified and is left alone.
    if write_pol.cmd <> 'ALL' or write_pol.permissive <> 'PERMISSIVE' or write_pol.using_expr is null then
      continue;
    end if;

    execute format('drop policy %I on public.%I', pair.prefix || '_write', pair.tablename);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (%s)',
      pair.prefix || '_write_insert', pair.tablename, coalesce(write_pol.check_expr, write_pol.using_expr)
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (%s) with check (%s)',
      pair.prefix || '_write_update', pair.tablename, write_pol.using_expr, coalesce(write_pol.check_expr, write_pol.using_expr)
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (%s)',
      pair.prefix || '_write_delete', pair.tablename, write_pol.using_expr
    );
  end loop;
end $$;
