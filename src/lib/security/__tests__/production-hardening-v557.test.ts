import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("production hardening v5.5.7", () => {
  it("protects an actually usable last Master", () => {
    const migration = source("supabase/migrations/060_nexponto_v557_final_production_validation.sql");
    expect(migration).toContain("count_effective_master_admins_v557");
    expect(migration).toMatch(/join public\.tenant_memberships[\s\S]*join auth\.users/);
    expect(migration).toContain("LAST_EFFECTIVE_MASTER_ADMIN");
    expect(migration).toContain("TENANT_OWNER_MUTATION_FORBIDDEN");
  });

  it("compensates Auth and database synchronization failures", () => {
    const route = source("src/app/api/admin/admins/route.ts");
    expect(route).toContain("synchronizeExistingAuthUser");
    expect(route).toContain("compensateAdminDatabase");
    expect(route).toContain("restoreAuthUser");
    expect(route).toContain("ADMIN_SYNC_PARTIAL_FAILURE");
    expect(route).toContain('rpc("upsert_tenant_admin_v557"');
  });

  it("keeps sessions on infrastructure failure and removes protected-area flash", () => {
    const shell = source("src/components/admin/AdminShell.tsx");
    const platform = source("src/app/platform/page.tsx");
    expect(shell).toContain("temporary_error");
    expect(shell).toContain("Sua sessão permanece ativa");
    expect(shell).toContain("onAuthStateChange");
    expect(platform).toContain('authState !== "ready"');
    expect(platform).toContain('router.replace("/platform/login")');
  });

  it("renews job leases and completes mobile drawer accessibility", () => {
    const jobs = source("src/app/api/internal/jobs/process/route.ts");
    const shell = source("src/components/admin/AdminShell.tsx");
    expect(jobs).toContain("startLeaseHeartbeat");
    expect(jobs).toContain("setInterval");
    expect(source("vercel.json")).toContain("/api/internal/jobs/process");
    expect(shell).toContain("moreDialogRef");
    expect(shell).toContain("moreReturnFocusRef");
    expect(shell).toContain("event.shiftKey");
  });
});
