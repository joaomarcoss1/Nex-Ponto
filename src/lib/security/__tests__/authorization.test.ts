import { describe, expect, it } from "vitest";
import {
  canonicalRole,
  hasPermission,
  resolvePermissions,
  canAccessBranch,
  canManageEmployees,
  canManagePayroll,
} from "@/lib/security/authorization";
import { adminRouteRequirement, requirementAllows, ADMIN_NAV_PERMISSION_BY_PATH } from "@/lib/security/admin-route-permissions";

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

  it("uses canonical capability helpers and branch scope", () => {
    expect(canManageEmployees("tenant_owner")).toBe(true);
    expect(canManagePayroll("branch_manager")).toBe(false);
    expect(canAccessBranch("branch-a", ["branch-a"])).toBe(true);
    expect(canAccessBranch("branch-b", ["branch-a"])).toBe(false);
  });

  it("maps admin routes and menu entries to the same permission model", () => {
    expect(adminRouteRequirement("/api/admin/employees", "GET")).toEqual({ any: ["employee.view", "employee.manage"] });
    expect(adminRouteRequirement("/api/admin/employees", "POST")).toEqual({ all: ["employee.manage"] });
    expect(ADMIN_NAV_PERMISSION_BY_PATH["/admin/revisoes-ponto"]).toEqual({ all: ["time_entry.review"] });
    expect(ADMIN_NAV_PERMISSION_BY_PATH["/admin/banco-de-horas"]).toEqual({ any: ["time_bank.view", "time_bank.manage"] });
    expect(requirementAllows(["employee.view"], adminRouteRequirement("/api/admin/employees", "GET")!)).toBe(true);
    expect(requirementAllows(["employee.view"], adminRouteRequirement("/api/admin/employees", "POST")!)).toBe(false);
  });
});
