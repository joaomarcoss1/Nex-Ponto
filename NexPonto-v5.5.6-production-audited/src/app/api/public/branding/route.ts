import { NextRequest, NextResponse } from "next/server";
import { defaultSettings } from "@/lib/constants";
import { requirePublicTenant } from "@/lib/server/public-tenant";
import { getTenantBranding } from "@/lib/server/branding";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { supabase, tenant } = await requirePublicTenant(request);
    const tenantBranding = await getTenantBranding(supabase);
    const branding = {
      ...tenantBranding,
      app_short_name: tenantBranding.short_name,
      app_tagline: tenantBranding.tagline,
    };
    return NextResponse.json(
      { tenant: { slug: tenant.slug, name: tenant.displayName }, branding },
      { headers: { "Cache-Control": "private, no-store, max-age=0", "Vary": "Host, X-NexPonto-Tenant" } }
    );
  } catch {
    return NextResponse.json(
      { branding: defaultSettings },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } }
    );
  }
}
