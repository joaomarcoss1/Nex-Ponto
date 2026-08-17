import { NextRequest } from "next/server";
import { requirePublicTenant } from "@/lib/server/public-tenant";
import { fail, ok } from "@/lib/server/http";
import { assertPin, getClientIp, isPinTemporarilyBlocked, recordPinAttempt, verifyPin } from "@/lib/server/pin";
import { consumeRateLimit, rateLimitBucket } from "@/lib/server/rate-limit";
import { validateUpload } from "@/lib/security/uploads";


export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const employeeId = String(formData.get("employeeId") || "");
    const pin = assertPin(String(formData.get("pin") || ""));
    const absenceDate = String(formData.get("absenceDate") || "");
    const justificationText = String(formData.get("justificationText") || "").trim();
    const file = formData.get("attachment");

    if (!employeeId) return fail("Selecione um funcionário.", 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(absenceDate)) return fail("Informe a data da falta.", 400);
    if (justificationText.length < 8) return fail("Descreva a justificativa com mais detalhes.", 400);

    const { supabase, tenant } = await requirePublicTenant(request);
    const rate = await consumeRateLimit({ supabase, bucket: rateLimitBucket([tenant.id, "justification", getClientIp(request.headers)]), limit: 10, windowSeconds: 300, blockSeconds: 300 });
    if (!rate.allowed) return fail("Muitos envios. Aguarde antes de tentar novamente.", 429);
    const { data: employee, error: employeeError } = await supabase
      .from("employees")
      .select("id, branch_id, pin_hash")
      .eq("id", employeeId)
      .eq("active", true)
      .maybeSingle();

    if (employeeError) return fail("Erro ao validar funcionário.", 500, employeeError.message);
    if (!employee) return fail("Funcionário ativo não encontrado.", 404);
    if (await isPinTemporarilyBlocked({ supabase, employeeId: employee.id })) {
      return fail("Muitas tentativas de PIN. Aguarde alguns minutos e tente novamente.", 429);
    }
    const validPin = await verifyPin(pin, employee.pin_hash);
    await recordPinAttempt({
      supabase,
      employeeId: employee.id,
      headers: request.headers,
      deviceInfo: request.headers.get("user-agent"),
      success: validPin,
      reason: validPin ? "absence_justification" : "invalid_pin_justification"
    });
    if (!validPin) return fail("PIN inválido.", 401);

    let attachmentPath: string | null = null;
    let attachmentUrl: string | null = null;
    let attachmentHash: string | null = null;
    let attachmentMime: string | null = null;
    if (file instanceof File && file.size > 0) {
      if (process.env.ATTACHMENT_SCANNER_ENABLED !== "true") {
        return fail("Envio de anexos temporariamente indisponível até a validação de segurança de arquivos ser ativada. Envie a justificativa sem anexo.", 503, { code: "ATTACHMENT_SCANNER_UNAVAILABLE" });
      }
      const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
      if (!(allowedTypes as readonly string[]).includes(file.type)) return fail("Anexo inválido. Envie PDF, JPG, PNG ou WEBP.", 400);
      if (file.size > 10 * 1024 * 1024) return fail("O anexo deve ter no máximo 10MB.", 400);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const validated = validateUpload(bytes, file.type, allowedTypes);
      const safeName = `${crypto.randomUUID()}.${validated.extension}`;
      attachmentPath = `${tenant.id}/${employee.id}/${absenceDate}/${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("justificativas")
        .upload(attachmentPath, bytes, {
          contentType: validated.mime,
          upsert: false
        });
      if (uploadError) return fail("Não foi possível enviar o anexo.", 500, uploadError.message);
      attachmentUrl = attachmentPath;
      attachmentHash = validated.sha256;
      attachmentMime = validated.mime;
    }

    const { data, error } = await supabase
      .from("absence_justifications")
      .insert({
        employee_id: employee.id,
        branch_id: employee.branch_id,
        absence_date: absenceDate,
        justification_text: justificationText,
        attachment_url: attachmentUrl,
        attachment_path: attachmentPath,
        attachment_sha256: attachmentHash,
        attachment_mime: attachmentMime,
        attachment_scan_status: attachmentPath ? "pending" : "not_required",
        status: "pending"
      })
      .select("*")
      .single();

    if (error) return fail("Não foi possível enviar a justificativa.", 500, error.message);
    return ok({ justification: data, message: "Justificativa enviada para revisão." });
  } catch (error) {
    return fail("Não foi possível enviar a justificativa agora. Tente novamente.", 503, error instanceof Error ? error.message : error);
  }
}
