import type { SupabaseClient } from "@supabase/supabase-js";
import { defaultSettings } from "@/lib/constants";
import type { SystemSettings } from "@/types/domain";

export const TENANT_SETTING_KEYS = new Set(Object.keys(defaultSettings));

export async function getSystemSettings(supabase: SupabaseClient): Promise<SystemSettings> {
  const values = { ...defaultSettings } as Record<string, unknown>;
  const { data: legacy, error: legacyError } = await supabase.from("system_settings").select("key,value");
  if (legacyError) throw new Error(legacyError.message);
  legacy?.forEach((setting) => {
    if (TENANT_SETTING_KEYS.has(setting.key)) values[setting.key] = setting.value;
  });

  const { data, error } = await supabase.from("tenant_settings").select("key,value");
  if (error) throw new Error(error.message);
  data?.forEach((setting) => {
    if (TENANT_SETTING_KEYS.has(setting.key)) values[setting.key] = setting.value;
  });
  return values as SystemSettings;
}

export async function updateSystemSettings(supabase: SupabaseClient, settings: Partial<SystemSettings>) {
  const rows = Object.entries(settings).filter(([key]) => TENANT_SETTING_KEYS.has(key)).map(([key, value]) => ({
    key,
    value
  }));
  if (!rows.length) return;
  const { error } = await supabase.from("tenant_settings").upsert(rows, { onConflict: "tenant_id,key" });
  if (error) throw new Error(error.message);
}

export const getTenantSettings = getSystemSettings;
export const updateTenantSettings = updateSystemSettings;
