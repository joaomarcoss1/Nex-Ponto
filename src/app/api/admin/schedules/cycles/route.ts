import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/server/auth";
import { assertCanAccessBranch, canManageBranches } from "@/lib/server/branch-permissions";
import { fail, ok, readJson } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cycleDaySchema = z.object({
  day_index: z.coerce.number().int().min(0).max(89),
  shift_template_id: z.string().uuid().nullable().optional(),
  is_day_off: z.coerce.boolean().default(false),
  notes: z.string().trim().max(240).nullable().optional(),
});

const cycleSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(2).max(100),
  code: z.string().trim().max(40).optional().default(""),
  cycle_type: z.enum(["5x2", "6x1", "12x36", "week_ab", "rotating_sundays", "custom"]),
  description: z.string().trim().max(500).nullable().optional(),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  effective_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  validation_policy: z.enum(["block", "justify", "warn"]).default("block"),
  configuration: z.record(z.unknown()).optional().default({}),
  days: z.array(cycleDaySchema).min(1).max(90),
});

const assignmentSchema = z.object({
  employee_id: z.string().uuid(),
  branch_id: z.string().uuid(),
  cycle_id: z.string().uuid(),
  cycle_start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  effective_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const branchId = request.nextUrl.searchParams.get("branchId");
  if (branchId) {
    const branchError = assertCanAccessBranch(auth.context, branchId);
    if (branchError) return branchError;
  }
  const [cyclesResult, templateResult, assignmentResult, employeeResult] = await Promise.all([
    auth.supabase.from("schedule_cycles").select("*,schedule_cycle_days(*)").eq("active", true).order("name"),
    auth.supabase.from("shift_templates").select("id,name,starts_at,ends_at,branch_id,color").eq("active", true).order("name"),
    auth.supabase.from("employee_schedule_cycle_assignments").select("*,employees(full_name,registration_code),schedule_cycles(name,cycle_type)").eq("status", "active").order("effective_from", { ascending: false }),
    branchId
      ? auth.supabase.from("employees").select("id,full_name,registration_code,branch_id,role,sector").eq("active", true).eq("branch_id", branchId).order("full_name")
      : auth.supabase.from("employees").select("id,full_name,registration_code,branch_id,role,sector").eq("active", true).order("full_name").limit(1000),
  ]);
  const firstError = [cyclesResult, templateResult, assignmentResult, employeeResult].find((result) => result.error)?.error;
  if (firstError) return fail("Erro ao carregar ciclos de escala.", 500, firstError.message);
  return ok({ cycles: cyclesResult.data || [], templates: templateResult.data || [], assignments: assignmentResult.data || [], employees: employeeResult.data || [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  if (!canManageBranches(auth.context)) return fail("Você não possui permissão para configurar ciclos.", 403);
  const parsed = cycleSchema.safeParse(await readJson<unknown>(request));
  if (!parsed.success) return fail("Revise os dados do ciclo.", 422, parsed.error.flatten());
  const input = parsed.data;
  if (input.effective_until && input.effective_until < input.effective_from) return fail("A vigência final não pode ser anterior à inicial.", 422);
  const indexes = input.days.map((day) => day.day_index).sort((a, b) => a - b);
  if (indexes.some((value, index) => value !== index)) return fail("Os dias do ciclo devem ser sequenciais a partir de zero.", 422);
  const { data, error } = await auth.rawSupabase.rpc("upsert_schedule_cycle_v51", {
    p_tenant_id: auth.context.tenantId,
    p_cycle_id: input.id || null,
    p_name: input.name,
    p_code: input.code,
    p_cycle_type: input.cycle_type,
    p_description: input.description || null,
    p_effective_from: input.effective_from,
    p_effective_until: input.effective_until || null,
    p_validation_policy: input.validation_policy,
    p_configuration: input.configuration,
    p_days: input.days,
    p_actor: auth.context.userId,
  });
  if (error) return fail("Erro ao salvar ciclo de escala.", 422, error.message);
  return ok({ cycle: data });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  if (!canManageBranches(auth.context)) return fail("Você não possui permissão para atribuir ciclos.", 403);
  const parsed = assignmentSchema.safeParse(await readJson<unknown>(request));
  if (!parsed.success) return fail("Revise a atribuição do ciclo.", 422, parsed.error.flatten());
  const input = parsed.data;
  const branchError = assertCanAccessBranch(auth.context, input.branch_id);
  if (branchError) return branchError;
  const { data, error } = await auth.rawSupabase.rpc("assign_schedule_cycle_v51", {
    p_tenant_id: auth.context.tenantId,
    p_employee_id: input.employee_id,
    p_branch_id: input.branch_id,
    p_cycle_id: input.cycle_id,
    p_cycle_start_date: input.cycle_start_date,
    p_effective_from: input.effective_from,
    p_effective_until: input.effective_until || null,
    p_actor: auth.context.userId,
  });
  if (error) return fail("Erro ao atribuir ciclo.", 422, error.message);
  return ok({ assignment: data });
}
