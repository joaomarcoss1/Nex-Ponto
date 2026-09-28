-- v5.5.8: closes two findings found by inspecting the LIVE production
-- database directly (Supabase advisors + pg_catalog), beyond what static
-- analysis of the migration history alone could show.

-- ---------------------------------------------------------------------------
-- 1. Nine functions from the pre-multitenant (single-tenant, admin_users +
--    auth.uid()/auth.email() based) architecture are still present, still
--    SECURITY DEFINER, and still directly callable by any authenticated user
--    via /rest/v1/rpc/<name> — confirmed by querying pg_policies (none of the
--    current tenant-scoped RLS policies reference them) and every function
--    body in pg_proc (no other function calls them either), and the
--    application's own TypeScript source (no .rpc() call site anywhere).
--    They were superseded by the tenant-scoped equivalents introduced from
--    migration 020 onward (current_tenant_id(), has_tenant_permission(),
--    can_access_branch(p_tenant_id,p_branch_id), etc.) but were never
--    revoked when that migration landed. Kept in place (not dropped) per
--    this project's own conservative dead-code policy — only the ability
--    for a signed-in user to call them directly via PostgREST is removed.
revoke execute on function public.is_admin() from public, anon, authenticated;
revoke execute on function public.is_master_admin() from public, anon, authenticated;
revoke execute on function public.current_admin_id() from public, anon, authenticated;
revoke execute on function public.current_admin_branch_id() from public, anon, authenticated;
revoke execute on function public.current_admin_branch_ids() from public, anon, authenticated;
revoke execute on function public.current_admin_allowed_branch_ids() from public, anon, authenticated;
revoke execute on function public.admin_can_access_all_branches() from public, anon, authenticated;
revoke execute on function public.current_admin_profile() from public, anon, authenticated;
revoke execute on function public.has_financial_permission() from public, anon, authenticated;
revoke execute on function public.can_access_branch(uuid) from public, anon, authenticated;

comment on function public.is_admin() is
  'v558: pré-multiempresa, órfã (nenhuma policy/função/rota chama). EXECUTE revogado de anon/authenticated — nunca reconceder (ver migration 061).';
comment on function public.can_access_branch(uuid) is
  'v558: overload de 1 argumento é pré-multiempresa e órfã; use can_access_branch(p_tenant_id, p_branch_id). EXECUTE revogado de anon/authenticated (ver migration 061).';

-- ---------------------------------------------------------------------------
-- 2. pg_trgm (used only for the employees.full_name trigram GIN index) was
--    installed in the public schema. Every SECURITY DEFINER function's
--    search_path in this project already includes an "extensions" schema
--    (see current_tenant_id, has_tenant_permission, etc.), so this simply
--    finishes moving it to where those functions already expect extensions
--    to live. The existing GIN index keeps working: PostgreSQL resolves an
--    operator class to its owning extension at index-creation time, so
--    relocating the extension afterward does not require rebuilding it, and
--    the app only ever queries through ILIKE (which the trigram index
--    supports independently of schema-qualifying similarity()/% at call
--    sites — neither appears anywhere in this codebase).
alter extension pg_trgm set schema extensions;
