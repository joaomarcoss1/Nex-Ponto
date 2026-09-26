import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("production hardening v5.5.5", () => {
  it("login admin usa runtime config e nao bloqueia exclusivamente por NEXT_PUBLIC", () => {
    const login = source("src/components/admin/AdminLogin.tsx");
    const client = source("src/lib/client/supabase.ts");
    expect(login).toContain("loadBrowserSupabaseConfig");
    expect(login).toContain("Tentar novamente");
    expect(client).toContain("/api/public/runtime-config");
    expect(client).toContain("loadBrowserSupabaseConfig");
    expect(login).not.toContain("!process.env.NEXT_PUBLIC_SUPABASE_URL");
  });

  it("runtime-config nao expoe service role, salts ou tokens", () => {
    const runtimeRoute = source("src/app/api/public/runtime-config/route.ts");
    expect(runtimeRoute).toContain("supabaseAnonKey");
    expect(runtimeRoute).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE|RATE_LIMIT_HASH_SALT|AUDIT_HASH_SALT|INTERNAL_JOBS_SECRET|RECEIPT_TOKEN_SECRET/);
  });

  it("cron por minuto foi removido e migration 058 corrige text/plain", () => {
    expect(source("vercel.json")).not.toMatch(/"schedule"\s*:\s*"\*\s+\*\s+\*\s+\*\s+\*"/);
    expect(source("supabase/migrations/058_nexponto_v555_production_recovery.sql")).toContain("text/plain");
  });
});
