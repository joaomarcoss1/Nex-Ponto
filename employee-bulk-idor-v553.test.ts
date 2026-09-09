import { createClient } from "@supabase/supabase-js";
import { compare } from "bcryptjs";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { PATCH } from "@/app/api/admin/employees/bulk/route";

const env = process.env;
const configured = Boolean(env.TEST_SUPABASE_URL && env.TEST_SUPABASE_ANON_KEY && env.TEST_SUPABASE_SERVICE_ROLE_KEY && env.TEST_TENANT_A_EMAIL && env.TEST_TENANT_A_PASSWORD && env.TEST_TENANT_A_ID && env.TEST_TENANT_A_EMPLOYEE_ID && env.TEST_TENANT_B_ID && env.TEST_TENANT_B_BRANCH_ID && env.TEST_TENANT_B_EMPLOYEE_ID);
if (configured) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.TEST_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = env.TEST_SUPABASE_ANON_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = env.TEST_SUPABASE_SERVICE_ROLE_KEY;
}

async function accessToken() {
  const client = createClient(env.TEST_SUPABASE_URL!, env.TEST_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: env.TEST_TENANT_A_EMAIL!, password: env.TEST_TENANT_A_PASSWORD! });
  if (error || !data.session) throw error || new Error("LOGIN_SESSION_MISSING");
  return data.session.access_token;
}

async function requestBulk(token: string, body: unknown) {
  return PATCH(new NextRequest("http://integration.local/api/admin/employees/bulk", {
    method: "PATCH",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}

describe.skipIf(!configured)("employee bulk IDOR with real Auth and service role", () => {
  it.each(["tenant_id", "pin_hash", "id", "created_at", "updated_at"])("returns 422 for protected field %s", async (field) => {
    const response = await requestBulk(await accessToken(), { ids: [env.TEST_TENANT_A_EMPLOYEE_ID], patch: { [field]: env.TEST_TENANT_B_ID } });
    expect(response.status).toBe(422);
  });

  it("cannot assign a branch from tenant B", async () => {
    const response = await requestBulk(await accessToken(), { ids: [env.TEST_TENANT_A_EMPLOYEE_ID], patch: { branch_id: env.TEST_TENANT_B_BRANCH_ID } });
    expect([403, 422]).toContain(response.status);
  });

  it("rejects conflicting PIN modes and returns only a PIN confirmed by bcrypt", async () => {
    const token = await accessToken();
    const conflict = await requestBulk(token, { ids: [env.TEST_TENANT_A_EMPLOYEE_ID], generatePins: true, patch: { pin: "1234" } });
    expect(conflict.status).toBe(422);

    const response = await requestBulk(token, { ids: [env.TEST_TENANT_A_EMPLOYEE_ID], generatePins: true, patch: {} });
    expect(response.status).toBe(200);
    const payload = await response.json() as { generatedPins: Array<{ generated_pin: string }> };
    const returnedPin = payload.generatedPins?.[0]?.generated_pin;
    expect(returnedPin).toMatch(/^\d{4}$/);

    const admin = createClient(env.TEST_SUPABASE_URL!, env.TEST_SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const stored = await admin.from("employees").select("pin_hash").eq("id", env.TEST_TENANT_A_EMPLOYEE_ID!).single();
    expect(stored.error).toBeNull();
    expect(await compare(returnedPin, stored.data?.pin_hash || "")).toBe(true);
  });

  it("cannot update an employee from tenant B and does not mutate it", async () => {
    const admin = createClient(env.TEST_SUPABASE_URL!, env.TEST_SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const before = await admin.from("employees").select("id,tenant_id,role,branch_id").eq("id", env.TEST_TENANT_B_EMPLOYEE_ID!).single();
    expect(before.error).toBeNull();
    const response = await requestBulk(await accessToken(), { ids: [env.TEST_TENANT_B_EMPLOYEE_ID], patch: { role: "IDOR probe" } });
    expect([403, 422]).toContain(response.status);
    const after = await admin.from("employees").select("id,tenant_id,role,branch_id").eq("id", env.TEST_TENANT_B_EMPLOYEE_ID!).single();
    expect(after.data).toEqual(before.data);
  });

  it("database trigger rejects tenant mutation even with service role", async () => {
    const admin = createClient(env.TEST_SUPABASE_URL!, env.TEST_SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const { error } = await admin.from("employees").update({ tenant_id: env.TEST_TENANT_B_ID }).eq("id", env.TEST_TENANT_A_EMPLOYEE_ID!);
    expect(error?.message).toContain("TENANT_MUTATION_FORBIDDEN");
  });
});
