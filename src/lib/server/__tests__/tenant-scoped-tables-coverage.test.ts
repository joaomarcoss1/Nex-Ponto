import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TENANT_SCOPED_TABLES } from "@/lib/server/tenant-scoped-client";

/**
 * Every table created with an explicit `tenant_id ... references
 * public.tenants` column belongs to exactly one company. If a route ever
 * reaches it through the service-role client (see tenant-scoped-client.ts),
 * that table needs to be in TENANT_SCOPED_TABLES or the automatic tenant
 * filter/tenant_id injection silently does not apply to it.
 *
 * This test parses `create table` statements as text (no DB connection) and
 * fails if a newly added tenant-owned table is missing from the list, so
 * that gap can't reappear unnoticed the way it did for qr_token_uses,
 * tenant_settings, tenant_features and tenant_nsr_counters.
 */

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

// Tables that legitimately carry a tenant_id column but are read/written
// outside the per-tenant admin request path (platform console, pre-auth
// flows, or cross-tenant-by-design operational tables) — reviewed manually,
// not an escape hatch for new tenant-owned business tables.
const PLATFORM_SCOPED_EXCEPTIONS = new Set([
  "platform_audit_logs", // written/read only by the platform superadmin console
  "support_access_sessions", // platform support tooling; tenant_id names the tenant being supported, not the caller's own tenant
  "tenant_domains", // managed by platform onboarding, not per-tenant admin routes
  "tenant_subscriptions", // billing, managed by the platform/billing job, not per-tenant admin routes
  "tenant_usage", // usage metrics computed and read by platform jobs/console
  "tenant_memberships", // queried by auth_user_id before a tenant is selected (which tenants can this user access), and cross-tenant by the platform console — never through the tenant-scoped wrapper
  "admin_membership_reconciliation_logs" // written exclusively by the reconcile_admin_memberships_v55 RPC; never queried from application code
]);

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

function findTenantOwnedTables(): Set<string> {
  const tables = new Set<string>();
  for (const file of migrationFiles()) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    const tableRe = /create table(?: if not exists)?\s+public\.(\w+)\s*\(([\s\S]*?)\n\);/gi;
    for (const match of sql.matchAll(tableRe)) {
      const [, tableName, body] = match;
      if (/tenant_id\s+uuid[^,]*references\s+public\.tenants/i.test(body)) {
        tables.add(tableName.toLowerCase());
      }
    }
  }
  return tables;
}

describe("tenant-owned table coverage in TENANT_SCOPED_TABLES", () => {
  const tenantOwnedTables = findTenantOwnedTables();

  it("found a plausible number of tenant-owned tables (parser sanity check)", () => {
    // Guards against the regex silently matching nothing after a migration
    // format change and the test below passing for the wrong reason.
    expect(tenantOwnedTables.size).toBeGreaterThan(20);
  });

  it("every tenant-owned table is either scoped or an explicitly reviewed exception", () => {
    const missing = [...tenantOwnedTables].filter(
      (table) => !TENANT_SCOPED_TABLES.has(table) && !PLATFORM_SCOPED_EXCEPTIONS.has(table)
    );
    expect(
      missing,
      `Tenant-owned tables missing from TENANT_SCOPED_TABLES (add them there, or to PLATFORM_SCOPED_EXCEPTIONS with a reason):\n${missing.join("\n")}`
    ).toEqual([]);
  });

  it("does not list a platform exception that is actually already tenant-scoped", () => {
    const redundant = [...PLATFORM_SCOPED_EXCEPTIONS].filter((table) => TENANT_SCOPED_TABLES.has(table));
    expect(redundant).toEqual([]);
  });
});
