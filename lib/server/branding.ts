import type { SupabaseClient } from "@supabase/supabase-js";
import { defaultSettings } from "@/lib/constants";
import type { BrandingTheme } from "@/lib/branding/theme";

export const BRANDING_FIELDS = [
  "app_name", "short_name", "tagline", "logo_url", "mark_url", "favicon_url",
  "pwa_icon_url", "primary_color", "secondary_color", "accent_color",
  "background_color", "surface_color", "report_footer", "support_email", "support_phone",
] as const;

export type TenantBranding = BrandingTheme & {
  short_name?: string;
  tagline?: string;
  logo_url?: string | null;
  mark_url?: string | null;
  favicon_url?: string | null;
  pwa_icon_url?: string | null;
  report_footer?: string | null;
  support_email?: string | null;
  support_phone?: string | null;
};

export async function getTenantBranding(supabase: SupabaseClient): Promise<TenantBranding> {
  const { data, error } = await supabase
    .from("tenant_branding")
    .select(BRANDING_FIELDS.join(","))
    .maybeSingle();
  if (error) throw new Error(error.message);
  return {
    app_name: "NexPonto",
    primary_color: defaultSettings.primary_color || "#1268F3",
    secondary_color: defaultSettings.secondary_color || "#F4B51C",
    accent_color: defaultSettings.accent_color || "#22A5F5",
    background_color: defaultSettings.background_color || "#F5F7FB",
    surface_color: defaultSettings.surface_color || "#FFFFFF",
    ...((data as Partial<TenantBranding> | null) || {}),
  };
}

export async function updateTenantBranding(
  supabase: SupabaseClient,
  branding: Partial<TenantBranding>,
  updatedBy?: string,
) {
  const allowed = new Set<string>(BRANDING_FIELDS);
  const payload = Object.fromEntries(
    Object.entries(branding).filter(([key, value]) => allowed.has(key) && value !== undefined),
  );
  const { error } = await supabase.from("tenant_branding").upsert({
    ...payload,
    ...(updatedBy ? { updated_by: updatedBy } : {}),
    updated_at: new Date().toISOString(),
  }, { onConflict: "tenant_id" });
  if (error) throw new Error(error.message);
}
