import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/db";
import { fail, ok } from "@/lib/server/http";
import { createTenantScopedClient } from "@/lib/server/tenant-scoped-client";
import { syncUpcomingHolidayDecisions } from "@/lib/services/holiday-operations";
import { isAuthorizedInternalJob } from "@/lib/server/internal-job-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function syncHolidays(request: NextRequest) {
  if (!isAuthorizedInternalJob(request)) return fail("Credencial de job inválida.", 401);
  const admin = getSupabaseAdmin();
  const { data: tenants, error } = await admin
    .from("tenants")
    .select("id,slug")
    .in("status", ["trial", "active", "onboarding", "pending_validation"]);
  if (error) return fail("Erro ao carregar empresas ativas.", 500, error.message);

  const results: Array<{ tenantId: string; ok: boolean; holidays?: number; error?: string }> = [];
  for (const tenant of tenants || []) {
    try {
      const scoped = createTenantScopedClient(admin, tenant.id);
      const result = await syncUpcomingHolidayDecisions({ supabase: scoped });
      results.push({ tenantId: tenant.id, ok: true, holidays: result.holidays.length });
    } catch (cause) {
      results.push({ tenantId: tenant.id, ok: false, error: cause instanceof Error ? cause.message : "Falha desconhecida" });
    }
  }

  await admin.from("platform_audit_logs").insert({
    action: "holiday_decision_sync_job",
    resource_type: "background_job",
    metadata: {
      tenants: results.length,
      succeeded: results.filter((item) => item.ok).length,
      failed: results.filter((item) => !item.ok).length
    }
  });

  const failed = results.filter((item) => !item.ok).length;
  return ok({ processed: results.length, failed, results }, { status: failed ? 207 : 200 });
}

export async function POST(request: NextRequest) { return syncHolidays(request); }
export async function GET(request: NextRequest) { return syncHolidays(request); }
