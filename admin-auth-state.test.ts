import { describe, expect, it } from "vitest";
import { classifyAdminAuthFailure } from "@/lib/client/admin-auth-state";

describe("classifyAdminAuthFailure", () => {
  it("redireciona somente falhas reais de sessão", () => {
    expect(classifyAdminAuthFailure(401, "AUTH_SESSION_INVALID")).toBe("login");
    expect(classifyAdminAuthFailure(401, "AUTH_SESSION_REQUIRED")).toBe("login");
  });

  it("preserva a sessão em falhas temporárias", () => {
    expect(classifyAdminAuthFailure(500, "DATABASE_ERROR")).toBe("temporary_error");
    expect(classifyAdminAuthFailure(503, "ENVIRONMENT_NOT_READY")).toBe("temporary_error");
    expect(classifyAdminAuthFailure(undefined, "TIMEOUT")).toBe("temporary_error");
  });

  it("separa seleção de tenant e bloqueios de autorização", () => {
    expect(classifyAdminAuthFailure(409, "TENANT_SELECTION_REQUIRED")).toBe("tenant_selection");
    expect(classifyAdminAuthFailure(403, "MEMBERSHIP_NOT_FOUND")).toBe("fatal_error");
    expect(classifyAdminAuthFailure(403, "TENANT_INACTIVE")).toBe("fatal_error");
  });
});
