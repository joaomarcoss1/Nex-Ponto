import type { SupabaseClient } from "@supabase/supabase-js";
import { defaultSettings } from "@/lib/constants";
import type { SystemSettings } from "@/types/domain";

export async function getSystemSettings(supabase: SupabaseClient): Promise<SystemSettings> {
  const { data, error } = await supabase.from("system_settings").select("key,value");
  if (error) throw new Error(error.message);
  const values = { ...defaultSettings } as Record<string, unknown>;
  data?.forEach((setting) => {
    values[setting.key] = setting.value;
  });
  return values as SystemSettings;
}

export async function updateSystemSettings(supabase: SupabaseClient, settings: Partial<SystemSettings>) {
  const rows = Object.entries(settings).map(([key, value]) => ({
    key,
    value
  }));
  const { error } = await supabase.from("system_settings").upsert(rows, { onConflict: "tenant_id,key" });
  if (error) throw new Error(error.message);
}
