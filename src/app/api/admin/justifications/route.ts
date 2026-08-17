import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { writeAuditLog } from "@/lib/server/audit";
import { fail, ok, readJson } from "@/lib/server/http";
import { canAccessBranch, scopeByBranch } from "@/lib/server/branch-permissions";
import { z } from "zod";

const reviewSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["approved", "rejected", "pending"]),
  admin_observation: z.string().trim().max(1000).optional().default(""),
  absence_type: z.enum(["full_absence", "late", "early_leave", "extended_break", "partial_absence", "vacation", "leave", "medical_leave", "suspension"]).default("full_absence"),
  financial_effect: z.enum(["pending", "deductible", "non_deductible", "paid_leave"]),
  absence_minutes: z.coerce.number().int().positive().nullable().optional(),
  decision_reason: z.string().trim().min(5).max(1000),
});

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
      if (item.attachment_scan_status !== "clean") {
        return {
          ...item,
          signed_attachment_url: null,
          attachment_blocked_reason: "Anexo aguardando validação de segurança.",
        };
      }
      const { data: signed } = await auth.supabase.storage.from("justificativas").createSignedUrl(item.attachment_path, 60 * 20);
      return { ...item, signed_attachment_url: signed?.signedUrl || null };
    })
  );

  return ok({ justifications: withUrls });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const parsed = reviewSchema.safeParse(await readJson<unknown>(request));
  if (!parsed.success) return fail("Informe a decisão e seu efeito financeiro.", 422, parsed.error.flatten());
  const body = parsed.data;

  const { data: oldData } = await auth.supabase.from("absence_justifications").select("*").eq("id", body.id).maybeSingle();
  if (oldData?.branch_id && !canAccessBranch(auth.context, oldData.branch_id)) return fail("Você não tem acesso a esta justificativa.", 403);
  const { data, error } = await auth.supabase
    .from("absence_justifications")
    .update({
      status: body.status,
      admin_observation: body.admin_observation || null,
      absence_type: body.absence_type,
      workflow_status: body.status,
      effect_on_journey: body.status === "approved" ? "excused" : body.status === "rejected" ? "unexcused" : "pending",
      financial_effect: body.status === "pending" ? "pending" : body.financial_effect,
      absence_minutes: body.absence_minutes || null,
      decision_reason: body.decision_reason,
      decision_snapshot: {
        status: body.status,
        absence_type: body.absence_type,
        financial_effect: body.financial_effect,
        decided_at: new Date().toISOString(),
      },
      reviewed_by: auth.context.userId,
      reviewed_at: new Date().toISOString()
    })
    .eq("id", body.id)
    .select("*")
    .single();
  if (error) return fail("Erro ao revisar justificativa.", 500, error.message);
  await writeAuditLog({ supabase: auth.supabase, context: auth.context, action: "review", entity: "absence_justifications", entityId: data.id, oldData, newData: data, reason: body.decision_reason, headers: request.headers });
  return ok({ justification: data });
}
