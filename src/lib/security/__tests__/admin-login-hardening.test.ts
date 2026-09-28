import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

/**
 * Guards the MFA implementation added to close the "no second factor for
 * admin accounts" production-readiness finding. Supersedes the previous
 * version of this file, which locked the opposite behavior in place
 * (MFA deliberately kept out of the operational login path) — that was
 * correct for its time, this reflects the current, intentional state.
 */
describe("segundo fator (MFA) na autenticação administrativa", () => {
  it("o login detecta um fator verificado antes de emitir o cookie de sessão", () => {
    const loginRoute = source("src/app/api/auth/admin-login/route.ts");
    expect(loginRoute).toContain("hasVerifiedMfaFactor");
    expect(loginRoute).toContain("mfaRequired");
    // The aal1 tokens only ever go out in the MFA-required branch — a
    // regular (no-MFA) login sets the cookie directly and never puts the
    // access/refresh token pair in the JSON body.
    expect(loginRoute).toMatch(/mfaRequired:\s*true[\s\S]*session:\s*\{/);
  });

  it("toda rota administrativa reexige aal2 quando a conta tem um fator verificado", () => {
    const authLib = source("src/lib/server/auth.ts");
    expect(authLib).toContain("decodeAal");
    expect(authLib).toContain("hasVerifiedMfaFactor");
    expect(authLib).toContain('"MFA_REQUIRED"');
    // The gate has to run on every request (not just at login) — otherwise a
    // stolen aal1 cookie would be enough for an MFA-enrolled account.
    expect(authLib).toMatch(/decodeAal\(token\)\s*!==\s*"aal2"/);
  });

  it("contas sem fator cadastrado continuam autenticando normalmente", () => {
    // The aal2 gate in auth.ts only fires after confirming a verified
    // factor exists — accounts with none stay on aal1, so MFA rolls out
    // per-admin as each one enrolls instead of locking everyone out at once.
    const authLib = source("src/lib/server/auth.ts");
    expect(authLib).toMatch(/if\s*\(await hasVerifiedMfaFactor\([\s\S]{0,80}\)\)\s*\{/);
  });

  it("o desafio de MFA nunca expõe o token pela sessão de longa duração", () => {
    // AdminShell's own session gate (used for every ordinary page load)
    // never holds a token — it calls /api/admin/me and lets the cookie do
    // the work, same as always.
    const shell = source("src/components/admin/AdminShell.tsx");
    expect(shell).not.toMatch(/access_token/);
    expect(shell).toContain("mfa_required");
  });

  it("a página de MFA oferece cadastro e desafio reais, não mais um redirect de compatibilidade", () => {
    const page = source("src/app/admin/seguranca-mfa/page.tsx");
    expect(page).not.toContain('redirect("/admin")');
    expect(page).toContain("AdminMfa");
  });
});
