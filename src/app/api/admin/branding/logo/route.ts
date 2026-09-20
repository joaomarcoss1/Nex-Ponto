import crypto from "crypto";
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { writeAuditLog } from "@/lib/server/audit";
import { fail, ok } from "@/lib/server/http";
import { getTenantBranding, updateTenantBranding } from "@/lib/server/branding";
import { validateUpload } from "@/lib/security/uploads";

const allowedTypes = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"]
]);

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request, { all: ["branding.manage"] });
  if ("error" in auth) return auth.error;
  const form = await request.formData();
  const file = form.get("file");
  const slot = form.get("slot") === "mark" ? "mark_url" : "logo_url";
  if (!(file instanceof File)) return fail("Selecione uma imagem.", 400);
  const declaredExtension = allowedTypes.get(file.type);
  if (!declaredExtension) return fail("Use PNG, JPEG ou WebP.", 400);
  if (file.size > 2 * 1024 * 1024) return fail("A imagem deve ter no máximo 2 MB.", 400);
  const bytes = new Uint8Array(await file.arrayBuffer());
  let validated: ReturnType<typeof validateUpload>;
  try {
    validated = validateUpload(bytes, file.type, ["image/jpeg", "image/png", "image/webp"]);
  } catch (cause) {
    return fail(cause instanceof Error ? cause.message : "Imagem inválida.", 400);
  }
  const path = `${auth.context.tenantId}/${slot}/${crypto.randomUUID()}.${validated.extension}`;
  const { error: uploadError } = await auth.supabase.storage
    .from("nexponto-branding")
    .upload(path, bytes, { contentType: validated.mime, upsert: false, cacheControl: "3600" });
  if (uploadError) return fail("Erro ao enviar a imagem.", 500, uploadError.message);
  const { data } = auth.supabase.storage.from("nexponto-branding").getPublicUrl(path);
  const oldSettings = await getTenantBranding(auth.supabase);
  await updateTenantBranding(auth.supabase, { [slot]: data.publicUrl }, auth.context.userId);
  await writeAuditLog({
    supabase: auth.supabase,
    context: auth.context,
    action: "upload_brand_asset",
    entity: "tenant_branding",
    oldData: { [slot]: oldSettings[slot] },
    newData: { [slot]: data.publicUrl }
  });
  return ok({ url: data.publicUrl, slot });
}
