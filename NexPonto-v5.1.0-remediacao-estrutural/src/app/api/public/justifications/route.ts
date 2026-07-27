import { NextRequest } from "next/server";
import { requirePublicTenant } from "@/lib/server/public-tenant";
import { fail, ok } from "@/lib/server/http";
import { assertPin, isPinTemporarilyBlocked, recordPinAttempt, verifyPin } from "@/lib/server/pin";


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
    if (file instanceof File && file.size > 0) {
      const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
      if (!allowedTypes.includes(file.type)) return fail("Anexo inválido. Envie PDF, JPG, PNG ou WEBP.", 400);
      if (file.size > 10 * 1024 * 1024) return fail("O anexo deve ter no máximo 10MB.", 400);
      const extension = file.name.includes(".") ? file.name.split(".").pop() : "bin";
      const safeName = `${crypto.randomUUID()}.${extension}`;
      attachmentPath = `${tenant.id}/${employee.id}/${absenceDate}/${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("justificativas")
        .upload(attachmentPath, Buffer.from(await file.arrayBuffer()), {
          contentType: file.type || "application/octet-stream",
          upsert: false
        });
      if (uploadError) return fail("Não foi possível enviar o anexo.", 500, uploadError.message);
      attachmentUrl = attachmentPath;
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
        status: "pending"
      })
      .select("*")
      .single();

    if (error) return fail("Não foi possível enviar a justificativa.", 500, error.message);
    return ok({ justification: data, message: "Justificativa enviada para revisão." });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Erro inesperado.", 500);
  }
}
