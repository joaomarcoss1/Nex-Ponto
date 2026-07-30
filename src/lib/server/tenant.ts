import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PublicTenant = {
  id: string;
  slug: string;
  displayName: string;
  defaultTimezone?: string | null;
  status: "trial" | "active" | "suspended" | "cancelled";
};

export function normalizeHostname(value: string) {
  return value.trim().toLowerCase().split(":")[0];
}

export async function resolvePublicTenant(request: NextRequest, supabase: SupabaseClient): Promise<PublicTenant | null> {
  const host = normalizeHostname(request.headers.get("x-forwarded-host") || request.headers.get("host") || "");
  const accessCode = request.headers.get("x-nexponto-tenant")?.trim().toLowerCase();

  if (host) {
    const { data: domain } = await supabase
      .from("tenant_domains")
      .select("tenant_id, tenants!inner(id, slug, display_name, default_timezone, status)")
      .eq("hostname", host)
      .eq("verified", true)
      .maybeSingle();
    const tenant = Array.isArray(domain?.tenants) ? domain?.tenants[0] : domain?.tenants;
    if (tenant) return { id: tenant.id, slug: tenant.slug, displayName: tenant.display_name, defaultTimezone: tenant.default_timezone, status: tenant.status };
  }

  if (accessCode && (/^[a-f0-9]{24,96}$/.test(accessCode) || /^[a-z0-9][a-z0-9-]{1,62}$/.test(accessCode))) {
    let query = supabase
      .from("tenants")
      .select("id, slug, display_name, default_timezone, status");
    query = /^[a-f0-9]{24,96}$/.test(accessCode)
      ? query.eq("public_access_code", accessCode)
      : query.eq("slug", accessCode);
    const { data: tenant } = await query.maybeSingle();
    if (tenant) return { id: tenant.id, slug: tenant.slug, displayName: tenant.display_name, defaultTimezone: tenant.default_timezone, status: tenant.status };
  }

  return null;
}

export function assertTenantOperational(tenant: PublicTenant | null) {
  if (!tenant) throw new Error("TENANT_NOT_RESOLVED");
  if (tenant.status === "suspended" || tenant.status === "cancelled") throw new Error("TENANT_UNAVAILABLE");
  return tenant;
}
