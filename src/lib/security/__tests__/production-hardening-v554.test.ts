import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("production hardening v5.5.4", () => {
  it("uses an atomic database operation before returning generated PINs", () => {
    const route = source("src/app/api/admin/employees/bulk/route.ts");
    const migration = source("supabase/migrations/057_nexponto_v554_final_production_hardening.sql");
    expect(route).toContain('rpc("bulk_set_employee_pins_v554"');
    expect(route).toContain("updatedIds.size !== generated.length");
    expect(migration).toContain("PIN_BULK_ATOMIC_UPDATE_FAILED");
    expect(migration).toMatch(/revoke all on function public\.bulk_set_employee_pins_v554[\s\S]+authenticated/i);
  });

  it("does not keep the former 5,001-row report ceiling or raw export IP metadata", () => {
    const reports = source("src/app/api/admin/reports/route.ts");
    const employeeExport = source("src/app/api/admin/employees/export/route.ts");
    expect(reports).not.toContain("maxRows: 5001");
    expect(reports).not.toContain("data.length >= 5001");
    expect(reports).toContain("maxRows: 100_001");
    expect(reports).not.toMatch(/newData:\s*\{[^}]*\bip:/);
    expect(employeeExport).not.toMatch(/newData:\s*\{[^}]*\bip:/);
  });

  it("binds job failure to the worker and reaps exhausted leases", () => {
    const migration = source("supabase/migrations/057_nexponto_v554_final_production_hardening.sql");
    const worker = source("src/app/api/internal/jobs/process/route.ts");
    expect(migration).toContain("status='running' and worker_id=p_worker_id");
    expect(migration).toContain("status='dead_letter'");
    expect(worker).toContain('rpc("claim_background_job_v556"');
    expect(worker).toContain('rpc("fail_background_job_v556"');
    expect(worker).toContain("p_lease_token");
    expect(worker).toContain("if (failure.error)");
  });

  it("wires MFA into operational authentication behind an aal2 gate", () => {
    // Supersedes the previous "MFA kept outside operational authentication"
    // guard from this same file — real TOTP MFA was added deliberately as
    // part of the production-readiness pass; see
    // src/lib/security/__tests__/admin-login-hardening.test.ts for the full
    // set of behavioral guards around it.
    const login = source("src/app/api/auth/admin-login/route.ts");
    const authLib = source("src/lib/server/auth.ts");
    expect(login).toContain("hasVerifiedMfaFactor");
    expect(authLib).toMatch(/decodeAal\(token\)\s*!==\s*"aal2"/);
  });
});
