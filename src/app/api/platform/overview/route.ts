import { NextRequest } from "next/server";
import { requirePlatformSuperadmin } from "@/lib/server/auth";
import { fail, ok } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requirePlatformSuperadmin(request);
  if ("error" in auth) return auth.error;
  const [tenants, memberships, jobs, subscriptions] = await Promise.all([
    auth.supabase.from("tenants").select("id,status", { count: "exact" }),
    auth.supabase.from("tenant_memberships").select("id", { count: "exact", head: true }).eq("active", true),
    auth.supabase.from("background_jobs").select("id,status", { count: "exact" }).in("status", ["queued", "running", "failed", "dead_letter"]),
    auth.supabase.from("tenant_subscriptions").select("id,status", { count: "exact" }).in("status", ["trialing", "active", "past_due"]),
  ]);
  const firstError = [tenants, memberships, jobs, subscriptions].find((result) => result.error)?.error;
  if (firstError) return fail("Erro ao carregar visão da plataforma.", 500, firstError.message);
  const tenantRows = tenants.data || [];
  const jobRows = jobs.data || [];
  return ok({
    cards: {
      tenants: tenantRows.length,
      activeTenants: tenantRows.filter((row) => ["active", "trial", "onboarding", "pending_validation"].includes(row.status)).length,
      suspendedTenants: tenantRows.filter((row) => row.status === "suspended").length,
      activeMemberships: memberships.count || 0,
      activeSubscriptions: (subscriptions.data || []).filter((row) => ["active", "trialing"].includes(row.status)).length,
      failedJobs: jobRows.filter((row) => ["failed", "dead_letter"].includes(row.status)).length,
      queuedJobs: jobRows.filter((row) => ["queued", "running"].includes(row.status)).length,
    },
  });
}
