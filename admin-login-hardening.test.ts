import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("login administrativo sem segundo fator obrigatório", () => {
  const operationalFiles = [
    "src/components/admin/AdminLogin.tsx",
    "src/components/admin/AdminShell.tsx",
    "src/lib/server/auth.ts",
    "src/app/api/platform/support-sessions/route.ts",
  ];

  it.each(operationalFiles)("não executa challenge em %s", (file) => {
    expect(source(file)).not.toMatch(/auth\.mfa|MFA_REQUIRED|aal2|totp/i);
  });

  it("não ativa segundo fator implicitamente em produção", () => {
    expect(source("src/components/admin/AdminLogin.tsx")).not.toContain('NODE_ENV === "production"');
    expect(source("src/components/admin/AdminShell.tsx")).not.toContain("NEXT_PUBLIC_MFA_ENFORCEMENT_ENABLED");
  });

  it("mantém a rota antiga apenas como compatibilidade e retorna ao painel", () => {
    const legacyRoute = source("src/app/admin/seguranca-mfa/page.tsx");
    expect(legacyRoute).toContain('redirect("/admin")');
    expect(legacyRoute).not.toMatch(/enroll|challenge|verify|unenroll/i);
  });
});
