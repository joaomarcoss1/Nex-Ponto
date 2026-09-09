import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExportBranding } from "@/lib/server/exporters";

interface TenantBrandingRow {
  app_name?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  accent_color?: string | null;
  background_color?: string | null;
  surface_color?: string | null;
  report_footer?: string | null;
}

export async function getTenantExportBranding(supabase: SupabaseClient, tenantId: string, tenantName?: string): Promise<ExportBranding> {
  const { data, error } = await supabase
    .from("tenant_branding")
    .select("app_name,primary_color,secondary_color,accent_color,background_color,surface_color,report_footer")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(`Erro ao carregar identidade da empresa: ${error.message}`);
  const row = (data || {}) as TenantBrandingRow;
  return {
    appName: row.app_name || "NexPonto",
    companyName: tenantName || row.app_name || "NexPonto",
    primaryColor: row.primary_color || "#1268F3",
    secondaryColor: row.secondary_color || "#F4B51C",
    accentColor: row.accent_color || "#22A5F5",
    backgroundColor: row.background_color || "#EEF6FF",
    surfaceColor: row.surface_color || "#FFFFFF",
    footer: row.report_footer || undefined
  };
}
