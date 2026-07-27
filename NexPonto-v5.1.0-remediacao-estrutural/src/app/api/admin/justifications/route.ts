import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { writeAuditLog } from "@/lib/server/audit";
import { fail, ok, readJson } from "@/lib/server/http";
import { canAccessBranch, scopeByBranch } from "@/lib/server/branch-permissions";


export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const status = request.nextUrl.searchParams.get("status");
  const branchId = request.nextUrl.searchParams.get("branchId");
  let query = scopeByBranch(auth.supabase
    .from("absence_justifications")
    .select("*, employees(full_name, role), branches:branches!absence_justifications_branch_id_fkey(name)")
    .order("created_at", { ascending: false })
    .limit(300), auth.context, "branch_id");
  if (status) query = query.eq("status", status);
  if (branchId) {
    if (!canAccessBranch(auth.context, branchId)) return fail("Você não tem acesso a esta filial.", 403);
    query = query.eq("branch_id", branchId);
  }
  const { data, error } = await query;
  if (error) return fail("Erro ao listar justificativas.", 500, error.message);

  const withUrls = await Promise.all(
    (data || []).map(async (item: any) => {
      if (!item.attachment_path) return item;
      const { data: signed } = await auth.supabase.storage.from("justificativas").createSignedUrl(item.attachment_path, 60 * 20);
      return { ...item, signed_attachment_url: signed?.signedUrl || null };
    })
  );

  return ok({ justifications: withUrls });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const body = await readJson<any>(request);
  if (!body.id || !["approved", "rejected", "pending"].includes(body.status)) {
    return fail("Informe justificativa e status válido.", 400);
  }

  const { data: oldData } = await auth.supabase.from("absence_justifications").select("*").eq("id", body.id).maybeSingle();
  if (oldData?.branch_id && !canAccessBranch(auth.context, oldData.branch_id)) return fail("Você não tem acesso a esta justificativa.", 403);
  const { data, error } = await auth.supabase
    .from("absence_justifications")
    .update({
      status: body.status,
      admin_observation: body.admin_observation || null,
      reviewed_by: auth.context.userId,
      reviewed_at: new Date().toISOString()
    })
    .eq("id", body.id)
    .select("*")
    .single();
  if (error) return fail("Erro ao revisar justificativa.", 500, error.message);
  await writeAuditLog({ supabase: auth.supabase, context: auth.context, action: "review", entity: "absence_justifications", entityId: data.id, oldData, newData: data });
  return ok({ justification: data });
}
