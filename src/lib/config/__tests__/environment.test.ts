import { describe, expect, it } from "vitest";
import { resolveAppUrl, validateServerEnvironment } from "@/lib/config/environment";

const validEnv = {
  NODE_ENV: "production",
  APP_URL: "https://ponto.exemplo.com/",
  NEXT_PUBLIC_SUPABASE_URL: "https://projeto.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-key",
  TENANT_CONTEXT_SECRET: "a".repeat(32),
  EMPLOYEE_SESSION_SECRET: "b".repeat(32),
  AUDIT_HASH_SALT: "c".repeat(32),
  RATE_LIMIT_HASH_SALT: "d".repeat(32),
  INTERNAL_JOBS_SECRET: "e".repeat(32),
  DEVICE_IDENTITY_SECRET: "f".repeat(32),
  RECEIPT_TOKEN_SECRET: "g".repeat(32),
} as NodeJS.ProcessEnv;

describe("environment configuration", () => {
  it("prefers APP_URL and removes the trailing slash", () => {
    expect(resolveAppUrl({ env: validEnv, production: true })).toBe("https://ponto.exemplo.com");
  });

  it("rejects localhost and HTTP in production", () => {
    expect(() => resolveAppUrl({ env: { ...validEnv, APP_URL: "http://localhost:3000" }, production: true })).toThrow(/localhost/);
    expect(() => resolveAppUrl({ env: { ...validEnv, APP_URL: "http://ponto.exemplo.com" }, production: true })).toThrow(/HTTPS/);
  });

  it("reports the exact weak secret without exposing its value", () => {
    const result = validateServerEnvironment({ ...validEnv, RATE_LIMIT_HASH_SALT: "short" }, { production: true });
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({ name: "RATE_LIMIT_HASH_SALT", reason: "too_short" });
    expect(JSON.stringify(result)).not.toContain('"short"');
  });
});
