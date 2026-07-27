import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/db";
import { assertTenantOperational, resolvePublicTenant } from "@/lib/server/tenant";
import { createTenantScopedClient } from "@/lib/server/tenant-scoped-client";

export async function requirePublicTenant(request: NextRequest) {
  const rawSupabase = getSupabaseAdmin();
  let tenant = await resolvePublicTenant(request, rawSupabase);

  // Single-tenant deployments remain usable without a custom domain/header,
  // while multi-tenant installations must provide an explicit context.
  if (!tenant) {
    const { data: tenants, error } = await rawSupabase
      .from("tenants")
      .select("id,slug,display_name,status")
      .in("status", ["trial", "active"])
      .limit(2);
    if (!error && tenants?.length === 1) {
      const only = tenants[0];
      tenant = { id: only.id, slug: only.slug, displayName: only.display_name, status: only.status };
    }
  }

  const operationalTenant = assertTenantOperational(tenant);
  return {
    tenant: operationalTenant,
    rawSupabase,
    supabase: createTenantScopedClient(rawSupabase, operationalTenant.id)
  };
}
