import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertPayrollActionAvailable,
  requiredPayrollPermission,
} from "@/lib/security/payroll-actions";

describe("payroll action authorization", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("mapeia aprovações para permissões distintas", () => {
    expect(requiredPayrollPermission("transition", "hr_approved")).toBe("payroll.hr_approve");
    expect(requiredPayrollPermission("transition", "financial_approved")).toBe("payroll.financial_approve");
    expect(requiredPayrollPermission("transition", "closed")).toBe("payroll.close");
  });

  it("não permite marcar como paga com folha oficial desativada", () => {
    vi.stubEnv("FEATURE_OFFICIAL_PAYROLL", "false");
    const result = assertPayrollActionAvailable(["payroll.mark_paid"], "transition", "paid");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("folha oficial");
  });

  it("nega a ação quando a permissão exata não está presente", () => {
    expect(assertPayrollActionAvailable(["payroll.view"], "transition", "exported").allowed).toBe(false);
  });
});
