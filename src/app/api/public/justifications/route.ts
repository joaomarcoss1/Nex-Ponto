import { NextRequest } from "next/server";
import { requirePublicTenant } from "@/lib/server/public-tenant";
import { fail, ok } from "@/lib/server/http";
import { assertPin, isPinTemporarilyBlocked, recordPinAttempt, verifyPin } from "@/lib/server/pin";
import { privateStoragePath, validateUpload } from "@/lib/security/uploads";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const employeeId = String(formData.get("employeeId") || "");
    const pin = assertPin(String(formData.get("pin") || ""));
    const absenceDate = String(formData.get("absenceDate") || "");
    const justificationText = String(formData.get("justificationText") || "").trim();
    const file = formData.get("attachment");

    if (!employeeId) return fail("Selecione um funcionario.", 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(absenceDate)) return fail("Informe a data da falta.", 400);
    if (justificationText.length < 8) return fail("Descreva a justificativa com mais detalhes.", 400);

    const { supabase, tenant } = await requirePublicTenant(request);
    const { data: employee, error: employeeError } = await supabase
      .from("employees")
      .select("id, branch_id, pin_hash")
      .eq("id", employeeId)
      .eq("active", true)
      .maybeSingle();

    if (employeeError) return fail("Erro ao validar funcionario.", 500, employeeError.message);
    if (!employee) return fail("Funcionario ativo nao encontrado.", 404);
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
      reason: validPin ? "absence_justification" : "invalid_pin_justification",
    });
    if (!validPin) return fail("PIN invalido.", 401);

    let attachmentBytes: Uint8Array | null = null;
    let attachmentHash: string | null = null;
    let attachmentMime: string | null = null;
    let attachmentExtension: string | null = null;
    if (file instanceof File && file.size > 0) {
      const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
      if (!(allowedTypes as readonly string[]).includes(file.type)) return fail("Anexo invalido. Envie PDF, JPG, PNG ou WEBP.", 400);
      if (file.size > 10 * 1024 * 1024) return fail("O anexo deve ter no maximo 10MB.", 400);
      attachmentBytes = new Uint8Array(await file.arrayBuffer());
      const validated = validateUpload(attachmentBytes, file.type, allowedTypes);
      attachmentHash = validated.sha256;
      attachmentMime = validated.mime;
      attachmentExtension = validated.extension;
    }

    const { data, error } = await supabase
      .from("absence_justifications")
      .insert({
        employee_id: employee.id,
        branch_id: employee.branch_id,
        absence_date: absenceDate,
        justification_text: justificationText,
        attachment_url: null,
        attachment_path: null,
        attachment_sha256: attachmentHash,
        attachment_mime: attachmentMime,
        attachment_scan_status: attachmentBytes ? "pending_scan" : "not_required",
        status: "pending",
      })
      .select("*")
      .single();

    if (error) return fail("Nao foi possivel enviar a justificativa.", 500, error.message);

    if (attachmentBytes && attachmentExtension) {
      const attachmentPath = privateStoragePath({
        tenantId: tenant.id,
        entityType: "justifications",
        entityId: data.id,
        extension: attachmentExtension,
      });
      const { error: uploadError } = await supabase.storage
        .from("justificativas")
        .upload(attachmentPath, attachmentBytes, {
          contentType: attachmentMime || "application/octet-stream",
          upsert: false,
        });
      if (uploadError) {
        await supabase
          .from("absence_justifications")
          .update({ attachment_scan_status: "rejected" })
          .eq("id", data.id);
        return fail("Nao foi possivel enviar o anexo.", 500, uploadError.message);
      }
      const { data: updated, error: updateError } = await supabase
        .from("absence_justifications")
        .update({ attachment_path: attachmentPath, attachment_url: null })
        .eq("id", data.id)
        .select("*")
        .single();
      if (updateError) return fail("Justificativa criada, mas o anexo nao foi vinculado.", 500, updateError.message);
      const { error: scanJobError } = await supabase.from("background_jobs").insert({
        job_type: "attachment_scan",
        idempotency_key: `attachment_scan:${data.id}`,
        payload: {
          bucket: "justificativas",
          path: attachmentPath,
          justificationId: data.id,
          sha256: attachmentHash,
          mime: attachmentMime,
        },
        schema_version: 1,
        priority: 20,
      });
      if (scanJobError) {
        await supabase
          .from("absence_justifications")
          .update({ attachment_scan_status: "scan_failed", attachment_scan_result: { error: "queue_unavailable" } })
          .eq("id", data.id);
        return fail("Anexo recebido, mas a varredura de seguranca nao foi enfileirada.", 503, scanJobError.message);
      }
      return ok({
        justification: updated,
        message: "Justificativa enviada para revisao. O anexo ficara disponivel apos a varredura de seguranca.",
      });
    }

    return ok({ justification: data, message: "Justificativa enviada para revisao." });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Erro inesperado.", 500);
  }
}
