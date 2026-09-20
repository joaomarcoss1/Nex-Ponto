import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { canAccessBranch, scopeByBranch } from "@/lib/server/branch-permissions";
import { fail, ok } from "@/lib/server/http";
import { parseEmployeeImportFile, generatePin4 } from "@/lib/services/employee-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request, { all: ["employee.manage"] });
  if ("error" in auth) return auth.error;
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return fail("Envie um arquivo Excel, CSV ou PDF.", 400);
    const rows = await parseEmployeeImportFile(file);
    const { data: branches, error: branchError } = await scopeByBranch(
      auth.supabase.from("branches").select("id,name").eq("active", true),
      auth.context,
      "id"
    );
    if (branchError) return fail("Erro ao validar filiais.", 500, branchError.message);
    const branchMap = new Map<string, { id: string; name: string }>(
      (branches || []).map((branch: any) => [
        String(branch.name || "").trim().toLowerCase(),
        { id: String(branch.id), name: String(branch.name) },
      ]),
    );
    const registrationCodes = rows.map((row) => row.registration_code).filter(Boolean) as string[];
    const documents = rows.map((row) => row.document).filter(Boolean) as string[];
    const existing: any[] = [];
    if (registrationCodes.length) {
      const { data } = await scopeByBranch(
        auth.supabase.from("employees").select("id,registration_code,document,branch_id,full_name").in("registration_code", registrationCodes),
        auth.context,
        "branch_id"
      );
      existing.push(...(data || []));
    }
    if (documents.length) {
      const { data } = await scopeByBranch(
        auth.supabase.from("employees").select("id,registration_code,document,branch_id,full_name").in("document", documents),
        auth.context,
        "branch_id"
      );
      existing.push(...(data || []));
    }
    const prepared = rows.map((row) => {
      const branch = branchMap.get(String(row.branch_name || "").trim().toLowerCase());
      if (!branch) row.errors.push(`Filial não encontrada: ${row.branch_name || "vazio"}.`);
      if (branch && !canAccessBranch(auth.context, branch.id)) row.errors.push("Você não tem acesso à filial informada.");
      const matched = existing.find((item) => (row.registration_code && item.registration_code === row.registration_code) || (row.document && item.document === row.document));
      if (matched) {
        row.action = "update";
        row.warnings.push(`Funcionário existente será atualizado: ${matched.full_name}.`);
      }
      row.branch_id = branch?.id;
      if (!row.pin && !row.errors.length) row.generated_pin = generatePin4();
      return row;
    });
    return ok({ rows: prepared, summary: { total: prepared.length, valid: prepared.filter((row) => !row.errors.length).length, errors: prepared.filter((row) => row.errors.length).length } });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Erro ao processar importação.", 500);
  }
}
