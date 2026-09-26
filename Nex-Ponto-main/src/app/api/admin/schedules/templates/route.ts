import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/server/auth";
import { assertCanAccessBranch, scopeNullableBranchQuery } from "@/lib/server/branch-permissions";
import { fail, ok, readJson } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const intervalSchema = z.object({
  interval_type: z.string().trim().min(1).default("meal"),
  sequence: z.coerce.number().int().min(1),
  planned_start: z.string().trim().optional().nullable(),
  start_window_min: z.string().trim().optional().nullable(),
  start_window_max: z.string().trim().optional().nullable(),
  expected_minutes: z.coerce.number().int().min(0),
  minimum_minutes: z.coerce.number().int().min(0).default(0),
  maximum_minutes: z.coerce.number().int().min(0).optional().nullable(),
  paid: z.coerce.boolean().default(false),
  required: z.coerce.boolean().default(true),
  requires_clock: z.coerce.boolean().default(true),
  tolerance_minutes: z.coerce.number().int().min(0).default(0)
});

const templateSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  branch_id: z.string().uuid().optional().nullable(),
  name: z.string().trim().min(2).max(100),
  code: z.string().trim().max(30).optional().nullable(),
  role: z.string().trim().max(100).optional().nullable(),
  sector: z.string().trim().max(100).optional().nullable(),
  starts_at: z.string().regex(/^\d{2}:\d{2}$/),
  ends_at: z.string().regex(/^\d{2}:\d{2}$/),
  crosses_midnight: z.coerce.boolean().default(false),
  expected_daily_minutes: z.coerce.number().int().min(1).max(1440),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#1268F3"),
  intervals: z.array(intervalSchema).max(8).default([])
});

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const branchId = request.nextUrl.searchParams.get("branchId");
  let query = scopeNullableBranchQuery(
    auth.supabase
      .from("shift_templates")
      .select("*, shift_template_intervals(*)")
      .eq("active", true)
      .order("name"),
    auth.context,
    "branch_id"
  );
  if (branchId) query = query.or(`branch_id.is.null,branch_id.eq.${branchId}`);
  const { data, error } = await query;
  if (error) return fail("Erro ao carregar modelos de turno.", 500, error.message);
  return ok({ templates: data || [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const parsed = templateSchema.safeParse(await readJson(request));
  if (!parsed.success) return fail("Revise os dados do modelo de turno.", 422, parsed.error.flatten());
  const input = parsed.data;
  const branchCheck = assertCanAccessBranch(auth.context, input.branch_id);
  if (branchCheck) return branchCheck;

  const { data, error } = await auth.rawSupabase.rpc("upsert_shift_template_v4", {
    p_tenant_id: auth.context.tenantId,
    p_template_id: input.id || null,
    p_branch_id: input.branch_id || null,
    p_name: input.name,
    p_code: input.code || null,
    p_role: input.role || null,
    p_sector: input.sector || null,
    p_starts_at: input.starts_at,
    p_ends_at: input.ends_at,
    p_crosses_midnight: input.crosses_midnight,
    p_expected_daily_minutes: input.expected_daily_minutes,
    p_color: input.color,
    p_intervals: input.intervals,
    p_actor_user_id: auth.context.userId
  });
  if (error) {
    const message = error.message.includes("TEMPLATE_MINUTES_MISMATCH")
      ? "A carga diária não corresponde ao período do turno menos os intervalos não remunerados."
      : "Erro ao salvar o modelo de turno.";
    return fail(message, 422, error.message);
  }
  return ok({ template: data });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return fail("Modelo de turno não informado.", 400);
  const { data: existing, error: findError } = await auth.supabase
    .from("shift_templates")
    .select("id,branch_id")
    .eq("id", id)
    .maybeSingle();
  if (findError) return fail("Erro ao validar modelo.", 500, findError.message);
  if (!existing) return fail("Modelo não encontrado.", 404);
  const branchCheck = assertCanAccessBranch(auth.context, existing.branch_id);
  if (branchCheck) return branchCheck;
  const { error } = await auth.supabase.from("shift_templates").update({ active: false }).eq("id", id);
  if (error) return fail("Erro ao desativar modelo.", 500, error.message);
  return ok({ success: true });
}
