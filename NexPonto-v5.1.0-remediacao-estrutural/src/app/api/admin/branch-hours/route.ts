import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/server/auth";
import { canAccessBranch, canManageBranches } from "@/lib/server/branch-permissions";
import { fail, ok } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const hourSchema = z.object({
  weekday: z.coerce.number().int().min(0).max(6),
  is_closed: z.coerce.boolean().default(false),
  opens_at: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  closes_at: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  notes: z.string().trim().max(300).nullable().optional(),
}).superRefine((value, context) => {
  if (!value.is_closed && (!value.opens_at || !value.closes_at)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Informe abertura e fechamento.", path: ["opens_at"] });
  }
});

const updateSchema = z.object({
  branch_id: z.string().uuid(),
  effective_from: z.string().date(),
  reason: z.string().trim().min(5).max(500).default("Atualização do horário de funcionamento"),
  hours: z.array(hourSchema).length(7),
}).superRefine((value, context) => {
  const weekdays = new Set(value.hours.map((item) => item.weekday));
  if (weekdays.size !== 7) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Informe uma única configuração para cada dia da semana.", path: ["hours"] });
  }
});

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const branchId = request.nextUrl.searchParams.get("branchId");
  const referenceDate = request.nextUrl.searchParams.get("date") || new Date().toISOString().slice(0, 10);
  if (!branchId) return fail("Filial obrigatória.", 400);
  if (!canAccessBranch(auth.context, branchId)) return fail("Você não tem acesso a esta filial.", 403);

  const { data, error } = await auth.supabase
    .from("branch_operating_hours")
    .select("*")
    .eq("branch_id", branchId)
    .lte("effective_from", referenceDate)
    .or(`effective_until.is.null,effective_until.gte.${referenceDate}`)
    .order("weekday")
    .order("effective_from", { ascending: false });
  if (error) return fail("Erro ao carregar horários de funcionamento.", 500, error.message);

  const latest = new Map<number, Record<string, unknown>>();
  for (const row of (data || []) as Record<string, unknown>[]) {
    const weekday = Number(row.weekday);
    if (!latest.has(weekday)) latest.set(weekday, row);
  }
  return ok({
    referenceDate,
    hours: [...latest.values()].sort((a, b) => Number(a.weekday) - Number(b.weekday)),
  });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  if (!canManageBranches(auth.context)) return fail("Você não tem permissão para editar funcionamento.", 403);

  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Revise os horários informados.", 422, parsed.error.flatten());
  const input = parsed.data;
  if (!canAccessBranch(auth.context, input.branch_id)) return fail("Filial inválida ou fora do seu acesso.", 403);

  const { data, error } = await auth.rawSupabase.rpc("replace_branch_operating_hours_v4", {
    p_tenant_id: auth.context.tenantId,
    p_branch_id: input.branch_id,
    p_effective_from: input.effective_from,
    p_hours: input.hours,
    p_actor_user_id: auth.context.userId,
    p_membership_id: auth.context.membershipId,
    p_reason: input.reason,
  });
  if (error) return fail("Erro ao salvar horários de funcionamento.", 500, error.message);
  return ok({ hours: data || [], effectiveFrom: input.effective_from });
}
