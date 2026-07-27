import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/server/auth";
import { assertCanAccessBranch, scopeByBranch } from "@/lib/server/branch-permissions";
import { fail, ok, readJson } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const occurrenceSchema = z.object({
  employee_id: z.string().uuid(),
  work_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  shift_template_id: z.string().uuid().optional().nullable(),
  is_day_off: z.coerce.boolean().default(false),
  intervals: z.array(z.record(z.unknown())).optional().default([])
});

const saveSchema = z.object({
  publication_id: z.string().uuid().optional().nullable(),
  branch_id: z.string().uuid(),
  period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  occurrences: z.array(occurrenceSchema).max(4000),
  publish: z.coerce.boolean().default(false),
  notes: z.string().trim().max(1000).optional().nullable()
});

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const branchId = request.nextUrl.searchParams.get("branchId");
  const startDate = request.nextUrl.searchParams.get("startDate");
  const endDate = request.nextUrl.searchParams.get("endDate");
  if (!branchId || !startDate || !endDate) return fail("Filial e período são obrigatórios.", 400);
  const branchCheck = assertCanAccessBranch(auth.context, branchId);
  if (branchCheck) return branchCheck;

  const [branchRes, employeesRes, templatesRes, publicationRes, coverageRes] = await Promise.all([
    auth.supabase.from("branches").select("id,name,timezone").eq("id", branchId).maybeSingle(),
    scopeByBranch(
      auth.supabase
        .from("employees")
        .select("id,full_name,registration_code,role,sector,branch_id")
        .eq("active", true)
        .order("full_name"),
      auth.context,
      "branch_id"
    ).eq("branch_id", branchId),
    auth.supabase
      .from("shift_templates")
      .select("*,shift_template_intervals(*)")
      .eq("active", true)
      .or(`branch_id.is.null,branch_id.eq.${branchId}`)
      .order("name"),
    auth.supabase
      .from("schedule_publications")
      .select("*,schedule_occurrences(*)")
      .eq("branch_id", branchId)
      .lte("period_start", endDate)
      .gte("period_end", startDate)
      .in("status", ["draft", "published"])
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
    auth.supabase
      .from("coverage_requirements")
      .select("*")
      .eq("branch_id", branchId)
      .eq("active", true)
      .lte("effective_from", endDate)
      .or(`effective_until.is.null,effective_until.gte.${startDate}`)
  ]);

  const firstError = [branchRes, employeesRes, templatesRes, publicationRes, coverageRes].find((result) => result.error)?.error;
  if (firstError) return fail("Erro ao carregar o planejamento de escalas.", 500, firstError.message);
  if (!branchRes.data) return fail("Filial não encontrada.", 404);

  let validationIssues: unknown[] = [];
  if (publicationRes.data?.id) {
    const { data: issueData, error: issueError } = await auth.supabase
      .from("schedule_validation_issues")
      .select("*")
      .eq("publication_id", publicationRes.data.id)
      .order("severity")
      .order("created_at");
    if (issueError) return fail("Erro ao carregar validações da escala.", 500, issueError.message);
    validationIssues = issueData || [];
  }

  return ok({
    branch: branchRes.data,
    employees: employeesRes.data || [],
    templates: templatesRes.data || [],
    publication: publicationRes.data || null,
    coverageRequirements: coverageRes.data || [],
    validationIssues
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const parsed = saveSchema.safeParse(await readJson(request));
  if (!parsed.success) return fail("Revise o período e as ocorrências da escala.", 422, parsed.error.flatten());
  const input = parsed.data;
  const branchCheck = assertCanAccessBranch(auth.context, input.branch_id);
  if (branchCheck) return branchCheck;

  const { data, error } = await auth.rawSupabase.rpc("save_schedule_publication_v51", {
    p_tenant_id: auth.context.tenantId,
    p_publication_id: input.publication_id || null,
    p_branch_id: input.branch_id,
    p_period_start: input.period_start,
    p_period_end: input.period_end,
    p_occurrences: input.occurrences,
    p_publish: input.publish,
    p_actor_user_id: auth.context.userId,
    p_membership_id: auth.context.membershipId,
    p_notes: input.notes || null
  });
  if (error) {
    const messages: Record<string, string> = {
      CLOSED_PERIOD: "A escala não pode ser alterada porque o período está fechado.",
      PUBLICATION_IMMUTABLE: "Uma escala publicada é imutável. Crie uma nova versão.",
      SHIFT_TEMPLATE_REQUIRED: "Selecione um turno para todos os dias trabalhados.",
      SCHEDULE_CONFLICTS: "Existem conflitos de horários. Corrija-os antes de publicar.",
      SCHEDULE_VALIDATION_BLOCKING: "A publicação foi bloqueada por cobertura ou conflitos críticos. Revise as pendências."
    };
    const key = Object.keys(messages).find((code) => error.message.includes(code));
    return fail(key ? messages[key] : "Erro ao salvar o planejamento.", 422, error.message);
  }
  const validationSummary = data?.validation_summary as { blocking?: number } | null | undefined;
  if (input.publish && Number(validationSummary?.blocking || 0) > 0) {
    return fail("A publicação foi bloqueada por cobertura ou conflitos críticos. O rascunho e as pendências foram preservados para correção.", 422, validationSummary);
  }
  return ok({ publication: data });
}
