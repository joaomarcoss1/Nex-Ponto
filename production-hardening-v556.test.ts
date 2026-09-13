import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("production hardening v5.5.6", () => {
  it("admin lifecycle uses the transactional admin/membership RPC", () => {
    const route = source("src/app/api/admin/admins/route.ts");
    const migration = source("supabase/migrations/059_nexponto_v556_final_auth_production_hardening.sql");
    expect(route).toContain('rpc("upsert_tenant_admin_v556"');
    expect(route).toContain("rollbackNewAuthUser");
    expect(route).not.toMatch(/from\("admin_users"\)\.(insert|update)/);
    expect(migration).toContain("upsert_tenant_admin_v556");
    expect(migration).toContain("on conflict(tenant_id,auth_user_id)");
  });

  it("auth rejects stale admin profile and membership authorization", () => {
    const auth = source("src/lib/server/auth.ts");
    expect(auth).toContain("ADMIN_MEMBERSHIP_ROLE_MISMATCH");
    expect(auth).toContain("ADMIN_MEMBERSHIP_BRANCH_MISMATCH");
    expect(auth).toContain("adminReadRouteRequirement");
    expect(auth).not.toContain("selectedMembership.role || profile.role");
  });

  it("clock registration does not report a false failure after commit", () => {
    const clock = source("src/app/api/public/clock/register/route.ts");
    expect(clock).toContain("requireReceiptConfig()");
    expect(clock).toContain("clock_receipt_generation_failed_after_commit");
    expect(clock).toContain('code === "23505"');
  });

  it("jobs, readiness, PWA and mobile shell use v5.5.6 contracts", () => {
    const worker = source("src/app/api/internal/jobs/process/route.ts");
    const readiness = source("src/app/api/readiness/route.ts");
    const shell = source("src/components/admin/AdminShell.tsx");
    const css = source("src/app/globals.css");
    expect(worker).toContain('rpc("claim_background_job_v556"');
    expect(worker).toContain("p_lease_token");
    expect(readiness).toContain('"upsert_tenant_admin_v556"');
    expect(readiness).toContain('"5.5.6"');
    expect(source("public/sw.js")).toContain("nexponto-v5.5.6-static");
    expect(shell).toContain("/admin/revisoes-ponto");
    expect(shell).toContain("/admin/banco-de-horas");
    expect(shell).not.toContain("[pathname, router, validationAttempt]");
    expect(css).not.toMatch(/\.btn-safe\s*\{[^}]*(^|[;{]\s*)width:\s*100%/m);
  });
});
