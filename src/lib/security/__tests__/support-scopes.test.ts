import { describe, expect, it } from "vitest";
import {
  permissionsForSupportScopes,
  supportScopeRequiresStepUp,
} from "@/lib/security/support-scopes";
import { PERMISSIONS } from "@/lib/security/authorization";

describe("support scopes", () => {
  it("não transforma leitura em acesso irrestrito", () => {
    const permissions = permissionsForSupportScopes(["support_read"], [...PERMISSIONS]);
    expect(permissions).toContain("audit.view");
    expect(permissions).not.toContain("employee.manage");
    expect(permissions).not.toContain("payroll.mark_paid");
  });

  it("remove pagamento até do acesso integral", () => {
    const permissions = permissionsForSupportScopes(["full_access"], [...PERMISSIONS]);
    expect(permissions).not.toContain("payroll.mark_paid");
    expect(supportScopeRequiresStepUp(["full_access"])).toBe(true);
  });
});
