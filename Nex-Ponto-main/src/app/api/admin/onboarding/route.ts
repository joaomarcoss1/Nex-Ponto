import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/server/auth";
import { writeAuditLog } from "@/lib/server/audit";
import { fail, ok } from "@/lib/server/http";

const updateSchema = z.object({
  stepKey: z.enum(["company", "branding", "first_branch", "operating_hours", "clock_policy", "admin_team", "gps_test", "qr_test", "activation"]),
  status: z.enum(["pending", "in_progress", "completed", "blocked", "skipped"]),
  evidence: z.record(z.unknown()).default({}),
});

async function readiness(auth: Awaited<ReturnType<typeof requireAdmin>>) {
  if ("error" in auth) return null;
  const [branchRes, hoursRes, gpsRes, qrRes, brandingRes, adminRes, policyRes] = await Promise.all([
    auth.supabase.from("branches").select("id", { count: "exact" }).eq("active", true),
    auth.supabase.from("branch_operating_hours").select("branch_id", { count: "exact" }),
    auth.supabase.from("branches").select("id", { count: "exact" }).eq("active", true).eq("gps_ready", true),
    auth.supabase.from("branch_qr_tokens").select("id", { count: "exact" }).eq("active", true).gt("valid_until", new Date().toISOString()),
    auth.rawSupabase.from("tenant_branding").select("tenant_id,app_name,logo_url,primary_color").eq("tenant_id", auth.context.tenantId).maybeSingle(),
    auth.supabase.from("admin_users").select("id", { count: "exact" }).eq("active", true),
    auth.rawSupabase.from("tenant_settings").select("key").eq("tenant_id", auth.context.tenantId).in("key", ["outside_operating_hours_policy", "clock_policy"]),
  ]);
  return {
    company: true,
    branding: Boolean(brandingRes.data?.app_name && brandingRes.data?.primary_color),
    first_branch: (branchRes.count || 0) > 0,
    operating_hours: (hoursRes.count || 0) >= 7,
    clock_policy: Boolean(policyRes.data?.length),
    admin_team: (adminRes.count || 0) > 0,
    gps_test: (gpsRes.count || 0) > 0,
    qr_test: (qrRes.count || 0) > 0,
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const expectedSteps = ["company", "branding", "first_branch", "operating_hours", "clock_policy", "admin_team", "gps_test", "qr_test", "activation"];
  const { error: repairError } = await auth.rawSupabase.from("tenant_onboarding_steps").upsert(
    expectedSteps.map((step_key) => ({ tenant_id: auth.context.tenantId, step_key, status: step_key === "company" ? "completed" : "pending" })),
    { onConflict: "tenant_id,step_key", ignoreDuplicates: true },
  );
  if (repairError) return fail("Não foi possível preparar o checklist de onboarding.", 500, repairError.message);
  const { data: steps, error } = await auth.supabase
    .from("tenant_onboarding_steps")
    .select("id,step_key,status,completed_at,evidence,updated_at")
    .order("created_at", { ascending: true });
  if (error) return fail("Erro ao carregar onboarding.", 500, error.message);
  const computed = await readiness(auth);
  const { data: tenant } = await auth.rawSupabase
    .from("tenants")
    .select("id,display_name,status,onboarding_status")
    .eq("id", auth.context.tenantId)
    .maybeSingle();
  return ok({ tenant, steps: steps || [], readiness: computed });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  if (!["tenant_owner", "tenant_admin", "master_admin"].includes(auth.context.role)) return fail("Somente a administração principal pode concluir o onboarding.", 403);
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Etapa inválida.", 422, parsed.error.flatten());
  const input = parsed.data;
  const computed = await readiness(auth);
  if (input.status === "completed" && input.stepKey !== "activation" && computed && input.stepKey in computed && !computed[input.stepKey as keyof typeof computed]) {
    return fail("Esta etapa ainda não possui evidência operacional suficiente.", 409);
  }
  if (input.stepKey === "activation" && input.status === "completed") {
    if (!computed || Object.values(computed).some((value) => !value)) return fail("Conclua todos os itens críticos antes de ativar a empresa.", 409, computed);
    const { error: tenantError } = await auth.rawSupabase
      .from("tenants")
      .update({ status: "active", onboarding_status: "ready", activated_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", auth.context.tenantId);
    if (tenantError) return fail("Erro ao ativar a empresa.", 500, tenantError.message);
  }
  const { data, error } = await auth.supabase
    .from("tenant_onboarding_steps")
    .upsert({
      step_key: input.stepKey,
      status: input.status,
      evidence: input.evidence,
      completed_at: input.status === "completed" ? new Date().toISOString() : null,
      completed_by: input.status === "completed" ? auth.context.userId : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "tenant_id,step_key" })
    .select("*")
    .single();
  if (error) return fail("Erro ao atualizar onboarding.", 500, error.message);
  await writeAuditLog({
    supabase: auth.supabase,
    context: auth.context,
    headers: request.headers,
    action: "update_tenant_onboarding",
    entity: "tenant_onboarding_steps",
    entityId: data.id,
    reason: `Etapa ${input.stepKey}: ${input.status}`,
    newData: { stepKey: input.stepKey, status: input.status, evidence: input.evidence },
  });
  return ok({ step: data });
}
