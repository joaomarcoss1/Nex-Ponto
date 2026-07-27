import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { writeAuditLog } from "@/lib/server/audit";
import { fail, ok, readJson } from "@/lib/server/http";
import { getSystemSettings, updateSystemSettings } from "@/lib/server/settings";
import { settingsPayloadSchema, zodErrorMessage } from "@/lib/validation/schemas";


export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request, ["master_admin"]);
  if ("error" in auth) return auth.error;
  try {
    return ok({ settings: await getSystemSettings(auth.supabase) });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Erro ao carregar configurações.", 500);
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdmin(request, ["master_admin"]);
  if ("error" in auth) return auth.error;
  try {
    const oldSettings = await getSystemSettings(auth.supabase);
    const rawBody = await readJson<unknown>(request);
    const parsedBody = settingsPayloadSchema.safeParse(rawBody);
    if (!parsedBody.success) return fail(zodErrorMessage(parsedBody.error), 400);
    await updateSystemSettings(auth.supabase, parsedBody.data);
    const newSettings = await getSystemSettings(auth.supabase);
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
