import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regression guard for the exact class of bug fixed in migration 060:
 * `replace_payroll_items_transactional` and `review_shift_request_transactional`
 * were `security definer` RPCs meant to be callable only by the server's
 * service-role connection, but an early migration revoked access from
 * `public` without also revoking Supabase's default per-role grants to
 * `anon`/`authenticated` — leaving them executable by any authenticated user
 * of any tenant via a direct PostgREST call, bypassing every RBAC check in
 * the Next.js app.
 *
 * This test parses the migrations as text (no database connection required)
 * and fails if any RPC that is ever granted to `service_role` still ends up
 * granted to `anon` or `authenticated` after all migrations are applied in
 * order — so this exact regression can never land silently again.
 */

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

/**
 * RPCs that are deliberately granted to both `authenticated` and
 * `service_role`. Each one only ever inspects the CALLER's own row (filtered
 * by `auth.uid()` inside the function body) — e.g. "does the logged-in user
 * have permission X in tenant Y" — so exposing them to `authenticated` can't
 * leak or mutate another tenant's data. Everything else granted to
 * `service_role` is assumed to be server-only and must never reach
 * `anon`/`authenticated`.
 */
const AUTHENTICATED_SAFE_RPCS = new Set(["has_tenant_permission", "has_tenant_permission_v54"]);

type RoleSet = Set<"anon" | "authenticated" | "service_role" | "public">;

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

function parseRoles(rawRoles: string): RoleSet {
  return new Set(
    rawRoles
      .split(",")
      .map((role) => role.trim().toLowerCase())
      .filter((role): role is "anon" | "authenticated" | "service_role" | "public" =>
        role === "anon" || role === "authenticated" || role === "service_role" || role === "public"
      )
  );
}

type Statement = { kind: "grant" | "revoke"; fn: string; roles: RoleSet; file: string };

function extractStatements(sql: string, file: string): Statement[] {
  const statements: Statement[] = [];

  const grantRe = /grant\s+execute\s+on\s+function\s+public\.(\w+)\s*\([\s\S]*?\)\s+to\s+([^;]+);/gi;
  for (const match of sql.matchAll(grantRe)) {
    statements.push({ kind: "grant", fn: match[1].toLowerCase(), roles: parseRoles(match[2]), file });
  }

  const revokeRe = /revoke\s+(?:all|execute)\s+on\s+function\s+public\.(\w+)\s*\([\s\S]*?\)\s+from\s+([^;]+);/gi;
  for (const match of sql.matchAll(revokeRe)) {
    statements.push({ kind: "revoke", fn: match[1].toLowerCase(), roles: parseRoles(match[2]), file });
  }

  return statements;
}

describe("tenant RPC grant hygiene (regression guard for migration 060)", () => {
  const files = migrationFiles();
  expect(files.length).toBeGreaterThan(0);

  const allStatements: Statement[] = [];
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    allStatements.push(...extractStatements(sql, file));
  }
  expect(allStatements.length).toBeGreaterThan(0);

  // Replay every grant/revoke in file (chronological) order to get the
  // final, currently-effective set of roles per function.
  const currentGrants = new Map<string, RoleSet>();
  const everGrantedServiceRole = new Set<string>();

  for (const statement of allStatements) {
    const current = currentGrants.get(statement.fn) ?? new Set<"anon" | "authenticated" | "service_role" | "public">();
    if (statement.kind === "grant") {
      for (const role of statement.roles) current.add(role);
      if (statement.roles.has("service_role")) everGrantedServiceRole.add(statement.fn);
    } else {
      for (const role of statement.roles) current.delete(role);
    }
    currentGrants.set(statement.fn, current);
  }

  it("never leaves a service-role-only RPC executable by anon/authenticated", () => {
    const offenders: string[] = [];
    for (const fn of everGrantedServiceRole) {
      if (AUTHENTICATED_SAFE_RPCS.has(fn)) continue;
      const roles = currentGrants.get(fn);
      if (roles?.has("anon") || roles?.has("authenticated")) {
        offenders.push(`${fn} -> ${[...(roles ?? [])].join(",")}`);
      }
    }
    expect(offenders, `RPCs meant for service_role only but still reachable by anon/authenticated:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("the two functions from the original incident are explicitly locked down", () => {
    for (const fn of ["replace_payroll_items_transactional", "review_shift_request_transactional"]) {
      const roles = currentGrants.get(fn);
      expect(roles?.has("service_role"), `${fn} should still be granted to service_role`).toBe(true);
      expect(roles?.has("anon"), `${fn} must not be granted to anon`).toBeFalsy();
      expect(roles?.has("authenticated"), `${fn} must not be granted to authenticated`).toBeFalsy();
    }
  });
});
