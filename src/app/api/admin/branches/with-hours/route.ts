import { NextRequest } from "next/server";
import { z } from "zod";
import { branchPayload, branchSchema } from "@/lib/contracts/branch";
import { requireAdmin } from "@/lib/server/auth";
import { canAccessBranch, canManageBranches } from "@/lib/server/branch-permissions";
import { enforceTenantLimit } from "@/lib/server/tenant-limits";
import { fail, ok } from "@/lib/server/http";

const hourSchema = z.object({
  weekday: z.coerce.number().int().min(0).max(6),
  is_closed: z.boolean(),
  opens_at: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional().or(z.literal("")),
  closes_at: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional().or(z.literal("")),
  notes: z.string().trim().max(300).nullable().optional(),
}).superRefine((value, context) => {
  if (!value.is_closed && (!value.opens_at || !value.closes_at)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Informe abertura e fechamento.", path: ["opens_at"] });
  }
});

const schema = z.object({
  branch: branchSchema,
  effective_from: z.string().date(),
  reason: z.string().trim().min(5).max(500),
  hours: z.array(hourSchema).length(7),
}).superRefine((value, context) => {
  if (new Set(value.hours.map((hour) => hour.weekday)).size !== 7) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Informe cada dia da semana uma única vez.", path: ["hours"] });
  }
});

export async function PUT(request: NextRequest) {
  const auth = await requireAdmin(request, { all: ["branch.manage"] });
  if ("error" in auth) return auth.error;
  if (!canManageBranches(auth.context)) return fail("Você não tem permissão para salvar unidades.", 403);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Revise os dados da filial e seus horários.", 422, parsed.error.flatten());
  const input = parsed.data;
  if (input.branch.id && !canAccessBranch(auth.context, input.branch.id)) return fail("Você não tem acesso a esta filial.", 403);
  let previous = null;
  if (input.branch.id) {
    const { data, error } = await auth.supabase.from("branches").select("*").eq("id", input.branch.id).maybeSingle();
    if (error) return fail("Não foi possível consultar a filial.", 500, error.message);
    if (!data) return fail("Filial não encontrada.", 404);
    previous = data;
  } else {
    try {
      await enforceTenantLimit({ supabase: auth.supabase, tenantId: auth.context.tenantId, limit: "branch_limit", currentTable: "branches" });
    } catch (cause) {
      return fail(cause instanceof Error ? cause.message : "Limite de filiais atingido.", 409);
    }
  }
  const payload = branchPayload(input.branch, previous);
  const { data, error } = await auth.rawSupabase.rpc("upsert_branch_with_hours_v54", {
    p_tenant_id: auth.context.tenantId,
    p_branch_id: input.branch.id || null,
    p_branch: payload,
    p_effective_from: input.effective_from,
    p_hours: input.hours,
    p_actor_user_id: auth.context.userId,
    p_membership_id: auth.context.membershipId,
    p_reason: input.reason,
  });
  if (error) return fail("Não foi possível salvar a filial e seus horários.", 500, error.message);
  return ok({ branch: data, operation: "committed", gpsValidationRequired: true });
}
