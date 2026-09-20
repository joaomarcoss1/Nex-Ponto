import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { writeAuditLog } from "@/lib/server/audit";
import { fail, ok, readJson } from "@/lib/server/http";
import { getSystemSettings, updateSystemSettings } from "@/lib/server/settings";
import { settingsPayloadSchema, zodErrorMessage } from "@/lib/validation/schemas";
import { getTenantBranding, updateTenantBranding, type TenantBranding } from "@/lib/server/branding";
import type { SystemSettings } from "@/types/domain";

const BRANDING_KEY_MAP: Partial<Record<keyof SystemSettings, keyof TenantBranding>> = {
  app_name: "app_name",
  app_short_name: "short_name",
  app_tagline: "tagline",
  logo_url: "logo_url",
  mark_url: "mark_url",
  primary_color: "primary_color",
  secondary_color: "secondary_color",
  accent_color: "accent_color",
  background_color: "background_color",
  surface_color: "surface_color",
  report_footer: "report_footer",
};

async function combinedSettings(supabase: Parameters<typeof getSystemSettings>[0]) {
  const [settings, branding] = await Promise.all([getSystemSettings(supabase), getTenantBranding(supabase)]);
  for (const [settingKey, brandingKey] of Object.entries(BRANDING_KEY_MAP) as Array<[keyof SystemSettings, keyof TenantBranding]>) {
    const value = branding[brandingKey];
    if (value !== undefined) (settings as Record<string, unknown>)[settingKey] = value;
  }
  return settings;
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request, { all: ["tenant.manage"] });
  if ("error" in auth) return auth.error;
  try {
    return ok({ settings: await combinedSettings(auth.supabase) });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Erro ao carregar configurações.", 500);
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdmin(request, { all: ["tenant.manage"] });
  if ("error" in auth) return auth.error;
  try {
    const oldSettings = await combinedSettings(auth.supabase);
    const rawBody = await readJson<unknown>(request);
    const parsedBody = settingsPayloadSchema.safeParse(rawBody);
    if (!parsedBody.success) return fail(zodErrorMessage(parsedBody.error), 400);
    const colorKeys = ["primary_color", "secondary_color", "accent_color", "background_color", "surface_color"] as const;
    if (process.env.NEXT_PUBLIC_ALLOW_TENANT_COLOR_OVERRIDE !== "true" && colorKeys.some((key) => key in parsedBody.data)) {
      return fail("A paleta institucional azul, branca e dourada está protegida nesta instalação.", 409);
    }
    const systemPatch: Partial<SystemSettings> = {};
    const brandingPatch: Partial<TenantBranding> = {};
    for (const [key, value] of Object.entries(parsedBody.data) as Array<[keyof SystemSettings, SystemSettings[keyof SystemSettings]]>) {
      const brandingKey = BRANDING_KEY_MAP[key];
      if (brandingKey) (brandingPatch as Record<string, unknown>)[brandingKey] = value;
      else (systemPatch as Record<string, unknown>)[key] = value;
    }
    if (Object.keys(systemPatch).length) await updateSystemSettings(auth.supabase, systemPatch);
    if (Object.keys(brandingPatch).length) await updateTenantBranding(auth.supabase, brandingPatch, auth.context.userId);
    const newSettings = await combinedSettings(auth.supabase);
    await writeAuditLog({
      supabase: auth.supabase,
      context: auth.context,
      action: "update",
      entity: "system_settings",
      oldData: oldSettings,
      newData: newSettings
    });
    return ok({ settings: newSettings });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Erro ao salvar configurações.", 500);
  }
}
