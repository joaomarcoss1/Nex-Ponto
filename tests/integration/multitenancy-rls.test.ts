import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

const url = process.env.TEST_SUPABASE_URL;
const anon = process.env.TEST_SUPABASE_ANON_KEY;
const tenantAEmail = process.env.TEST_TENANT_A_EMAIL;
const tenantAPassword = process.env.TEST_TENANT_A_PASSWORD;
const tenantBId = process.env.TEST_TENANT_B_ID;
const configured = Boolean(url && anon && tenantAEmail && tenantAPassword && tenantBId);

describe.skipIf(!configured)("RLS multitenant against a real Supabase test project", () => {
  it("prevents tenant A from reading employees from tenant B", async () => {
    const client = createClient(url!, anon!, { auth: { persistSession: false } });
    const { error: loginError } = await client.auth.signInWithPassword({ email: tenantAEmail!, password: tenantAPassword! });
    expect(loginError).toBeNull();
    const { data, error } = await client.from("employees").select("id,tenant_id").eq("tenant_id", tenantBId!);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("prevents tenant A from inserting an employee into tenant B", async () => {
    const client = createClient(url!, anon!, { auth: { persistSession: false } });
    await client.auth.signInWithPassword({ email: tenantAEmail!, password: tenantAPassword! });
    const { error } = await client.from("employees").insert({
      tenant_id: tenantBId,
      full_name: "RLS probe",
      role: "probe",
      branch_id: "00000000-0000-0000-0000-000000000000",
    });
    expect(error).not.toBeNull();
  });

  it("prevents tenant A from reading new v5.3 ledgers from tenant B", async () => {
    const client = createClient(url!, anon!, { auth: { persistSession: false } });
    await client.auth.signInWithPassword({ email: tenantAEmail!, password: tenantAPassword! });
    for (const table of [
      "clock_risk_events",
      "time_clock_receipts",
      "time_entry_adjustments",
      "payroll_state_transitions",
      "background_job_events",
      "privacy_requests",
    ]) {
      const { data, error } = await client.from(table).select("tenant_id").eq("tenant_id", tenantBId!);
      expect(error, `${table} deve existir e aceitar consulta isolada`).toBeNull();
      expect(data, `${table} não pode vazar linhas do tenant B`).toEqual([]);
    }
  });
});
