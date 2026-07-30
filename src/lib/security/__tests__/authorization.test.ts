import { describe, expect, it } from "vitest";
import {
  canonicalRole,
  hasPermission,
  resolvePermissions,
} from "@/lib/security/authorization";

describe("canonical authorization", () => {
  it("grants tenant owners every tenant permission", () => {
    const permissions = resolvePermissions("tenant_owner", []);
    expect(hasPermission(permissions, { all: ["tenant.manage", "payroll.close", "branding.manage"] })).toBe(true);
  });

  it("maps legacy roles without losing access", () => {
    expect(canonicalRole("master_admin")).toBe("tenant_owner");
    expect(canonicalRole("rh_financeiro")).toBe("payroll_manager");
    expect(resolvePermissions("rh_financeiro", [])).toContain("payroll.calculate");
  });

  it("does not grant payroll closure to a branch manager", () => {
    expect(hasPermission(resolvePermissions("branch_manager", []), { all: ["payroll.close"] })).toBe(false);
  });
});

