import { NextResponse } from "next/server";
import {
  inspectServiceRoleKey,
  validateServerEnvironment,
} from "@/lib/config/environment";
import { structuredLog } from "@/lib/observability/logger";
import { getSupabaseAdmin } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  const requestId = crypto.randomUUID();
  const coreConfiguration = validateServerEnvironment(process.env, { capability: "adminLogin", includeAppUrl: false });
  const browserRuntimeConfig = validateServerEnvironment(process.env, { capability: "browserRuntime", includeAppUrl: true });
  const tenantContext = validateServerEnvironment(process.env, { capability: "tenantContext", includeAppUrl: false });
  const employeeSessions = validateServerEnvironment(process.env, { capability: "employeeSession", includeAppUrl: false });
  const deviceIdentity = validateServerEnvironment(process.env, { capability: "device", includeAppUrl: false });
  const receiptTokens = validateServerEnvironment(process.env, { capability: "receipt", includeAppUrl: false });
  const jobsConfiguration = validateServerEnvironment(process.env, { capability: "jobs", includeAppUrl: false });
  let supabaseAuth = false;
  let database = false;
  let storage = false;
  let migrations = false;
  let criticalFunctions = false;
  let rateLimit = false;
  const requiredBuckets = ["exports", "payroll-exports"];
  const requiredFunctions = [
    "has_tenant_permission",
    "has_tenant_permission_v54",
    "reconcile_admin_memberships_v55",
    "upsert_employee_v552",
    "register_time_entry_v4",
    "bulk_set_employee_pins_v554",
    "upsert_tenant_admin_v556",
    "claim_background_job_v556",
    "heartbeat_background_job_v556",
    "complete_background_job_v556",
    "fail_background_job_v556",
  ];

  if (coreConfiguration.ok) {
    try {
      const supabase = getSupabaseAdmin();
      const [authResult, databaseResult, storageResult, versionResult, structureResult, rateLimitResult] = await Promise.all([
        supabase.auth.admin.listUsers({ page: 1, perPage: 1 }),
        supabase.from("tenants").select("id", { head: true, count: "exact" }).limit(1),
        supabase.storage.listBuckets(),
        supabase.from("nexponto_schema_versions").select("version").eq("version", "5.5.6").maybeSingle(),
        supabase.rpc("audit_database_structure_v54"),
        supabase.rpc("consume_rate_limit", {
          p_bucket_key: `readiness:${requestId}`,
          p_limit: 3,
          p_window_seconds: 60,
          p_block_seconds: 60,
        }),
      ]);
      supabaseAuth = !authResult.error && inspectServiceRoleKey(process.env.SUPABASE_SERVICE_ROLE_KEY).valid;
      database = !databaseResult.error;
      const bucketIds = new Set((storageResult.data || []).map((bucket) => bucket.id));
      storage = !storageResult.error && requiredBuckets.every((bucket) => bucketIds.has(bucket));
      migrations = !versionResult.error && Boolean(versionResult.data);
      const inventory = structureResult.data as { functions?: string[] } | null;
      criticalFunctions = !structureResult.error && requiredFunctions.every((name) => inventory?.functions?.includes(name));
      rateLimit = !rateLimitResult.error;
    } catch (cause) {
      structuredLog("error", "readiness_database_checks_failed", {
        requestId,
        message: cause instanceof Error ? cause.message : "unknown",
      });
    }
  }

  const checks = {
    coreConfiguration: coreConfiguration.ok,
    browserRuntimeConfig: browserRuntimeConfig.ok,
    tenantContext: tenantContext.ok,
    employeeSessions: employeeSessions.ok,
    deviceIdentity: deviceIdentity.ok,
    receiptTokens: receiptTokens.ok,
    supabaseAuth,
    database,
    migrations,
    criticalFunctions,
    rateLimit,
    storage,
    jobsConfiguration: jobsConfiguration.ok,
  };
  const failedComponents = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  const ready = failedComponents.length === 0;

  if (!ready) {
    structuredLog("error", "readiness_failed", {
      requestId,
      checks,
      failedComponents,
      environmentIssues: {
        core: coreConfiguration.issues,
        browserRuntime: browserRuntimeConfig.issues,
        tenantContext: tenantContext.issues,
        employeeSessions: employeeSessions.issues,
        deviceIdentity: deviceIdentity.issues,
        receiptTokens: receiptTokens.issues,
        jobs: jobsConfiguration.issues,
      },
    });
  }

  return NextResponse.json({
    status: ready ? "ready" : "not_ready",
    checks,
    failedComponents,
    code: ready
      ? undefined
      : !coreConfiguration.ok || !browserRuntimeConfig.ok || !supabaseAuth
        ? "ENVIRONMENT_NOT_READY"
        : !database
          ? "DATABASE_NOT_READY"
          : !storage
            ? "STORAGE_NOT_READY"
            : "MIGRATION_NOT_READY",
    requestId,
    durationMs: Date.now() - started,
    timestamp: new Date().toISOString(),
  }, { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
