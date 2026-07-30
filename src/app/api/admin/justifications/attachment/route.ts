import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { writeAuditLog } from "@/lib/server/audit";
import { canAccessBranch } from "@/lib/server/branch-permissions";
import { fail, ok } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request, { any: ["justification.view", "justification.review", "time_entry.review"] });
  if ("error" in auth) return auth.error;

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return fail("Informe a justificativa.", 400);

  const { data: justification, error } = await auth.supabase
    .from("absence_justifications")
    .select("id,branch_id,attachment_path,attachment_scan_status,attachment_mime")
    .eq("id", id)
    .maybeSingle();
  if (error) return fail("Erro ao validar anexo.", 500, error.message);
  if (!justification?.attachment_path) return fail("Anexo nao encontrado.", 404);
  if (justification.branch_id && !canAccessBranch(auth.context, justification.branch_id)) {
    return fail("Voce nao tem acesso a esta filial.", 403);
  }
  if (justification.attachment_scan_status !== "clean") {
    return fail("Anexo indisponivel ate a conclusao da varredura de seguranca.", 423, {
      code: "ATTACHMENT_NOT_RELEASED",
      scanStatus: justification.attachment_scan_status,
    });
  }

  const expectedPrefix = `${auth.context.tenantId}/justifications/${justification.id}/`;
  if (!String(justification.attachment_path).startsWith(expectedPrefix)) {
    return fail("Caminho de anexo fora do padrao seguro.", 409, { code: "STORAGE_PATH_INVALID" });
  }

  const { data: signed, error: signedError } = await auth.rawSupabase.storage
    .from("justificativas")
    .createSignedUrl(justification.attachment_path, 300);
  if (signedError || !signed?.signedUrl) return fail("Nao foi possivel gerar URL segura.", 500, signedError?.message);

  await writeAuditLog({
    supabase: auth.supabase,
    context: auth.context,
    action: "signed_url",
    entity: "absence_justification_attachment",
    entityId: justification.id,
    newData: {
      path: justification.attachment_path,
      expiresInSeconds: 300,
      mime: justification.attachment_mime,
    },
    reason: "download_private_attachment",
    headers: request.headers,
  });

  return ok({ signedUrl: signed.signedUrl, expiresInSeconds: 300 });
}
