import { describe, expect, it } from "vitest";
import {
  inspectServiceRoleKey,
  resolveAppUrl,
  validateServerEnvironment,
} from "@/lib/config/environment";

function jwt(payload: Record<string, unknown>) {
  return `${Buffer.from("{}").toString("base64url")}.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;
}

function serviceRolePlaceholder() {
  return "sb_" + "secret_" + "admin_login_placeholder_123456789";
}

describe("configuração de produção", () => {
  it("aceita a URL oficial da Vercel", () => {
    expect(resolveAppUrl({ env: { APP_URL: "https://nexponto.vercel.app", NODE_ENV: "production" }, production: true }))
      .toBe("https://nexponto.vercel.app");
  });

  it("diagnostica atribuição duplicada em APP_URL", () => {
    expect(() => resolveAppUrl({ env: { APP_URL: "APP_URL=https://nexponto.vercel.app", NODE_ENV: "production" }, production: true }))
      .toThrow(/duplicado/i);
  });

  it("diferencia service_role de chave anônima", () => {
    expect(inspectServiceRoleKey(jwt({ role: "service_role" })).valid).toBe(true);
    expect(inspectServiceRoleKey(jwt({ role: "anon" })).valid).toBe(false);
    expect(inspectServiceRoleKey("sb_" + "secret_" + "abcdefghijklmnopqrstuvwxyz123456").valid).toBe(true);
  });

  it("valida login admin sem exigir secrets de jobs, device ou recibo", () => {
    const env = {
      NODE_ENV: "test",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_ANON_KEY: "anon-placeholder-at-least-32-characters",
      SUPABASE_SERVICE_ROLE_KEY: serviceRolePlaceholder(),
      RATE_LIMIT_HASH_SALT: "rate-limit-salt-at-least-32-characters",
      AUDIT_HASH_SALT: "audit-hash-salt-at-least-32-characters",
    } as NodeJS.ProcessEnv;
    const result = validateServerEnvironment(env, { capability: "adminLogin", includeAppUrl: false });
    expect(result.ok).toBe(true);
  });

  it("falha explicitamente quando o login admin não tem rate-limit salt", () => {
    const env = {
      NODE_ENV: "test",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_ANON_KEY: "anon-placeholder-at-least-32-characters",
      SUPABASE_SERVICE_ROLE_KEY: serviceRolePlaceholder(),
      AUDIT_HASH_SALT: "audit-hash-salt-at-least-32-characters",
    } as NodeJS.ProcessEnv;
    const result = validateServerEnvironment(env, { capability: "adminLogin", includeAppUrl: false });
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({ name: "RATE_LIMIT_HASH_SALT", reason: "missing" });
  });

  it("não usa TEST_SUPABASE_* como fallback em produção", () => {
    const env = {
      NODE_ENV: "production",
      TEST_SUPABASE_URL: "https://test.supabase.co",
      TEST_SUPABASE_ANON_KEY: "test-anon-placeholder-at-least-32-characters",
      SUPABASE_SERVICE_ROLE_KEY: serviceRolePlaceholder(),
      RATE_LIMIT_HASH_SALT: "rate-limit-salt-at-least-32-characters",
      AUDIT_HASH_SALT: "audit-hash-salt-at-least-32-characters",
    } as NodeJS.ProcessEnv;
    const result = validateServerEnvironment(env, { capability: "adminLogin", includeAppUrl: false });
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({ name: "SUPABASE_URL", reason: "missing" });
    expect(result.issues).toContainEqual({ name: "SUPABASE_ANON_KEY", reason: "missing" });
  });
});
