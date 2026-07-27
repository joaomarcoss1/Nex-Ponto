import { NextRequest, NextResponse } from "next/server";
import { defaultSettings } from "@/lib/constants";
import { getSystemSettings } from "@/lib/server/settings";
import { requirePublicTenant } from "@/lib/server/public-tenant";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { supabase, tenant } = await requirePublicTenant(request);
    const { data: tenantBranding } = await supabase
      .from("tenant_branding")
      .select("app_name,short_name,tagline,logo_url,mark_url,favicon_url,pwa_icon_url,primary_color,secondary_color,accent_color,background_color,surface_color,support_email,support_phone")
      .eq("tenant_id", tenant.id)
      .maybeSingle();
    const settings = await getSystemSettings(supabase).catch(() => defaultSettings);
    const branding = tenantBranding
      ? {
          app_name: tenantBranding.app_name,
          app_short_name: tenantBranding.short_name,
          app_tagline: tenantBranding.tagline,
          logo_url: tenantBranding.logo_url,
          mark_url: tenantBranding.mark_url,
          favicon_url: tenantBranding.favicon_url,
          pwa_icon_url: tenantBranding.pwa_icon_url,
          primary_color: tenantBranding.primary_color,
          secondary_color: tenantBranding.secondary_color,
          accent_color: tenantBranding.accent_color,
          background_color: tenantBranding.background_color,
          surface_color: tenantBranding.surface_color,
          support_email: tenantBranding.support_email,
          support_phone: tenantBranding.support_phone
        }
      : settings;
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
