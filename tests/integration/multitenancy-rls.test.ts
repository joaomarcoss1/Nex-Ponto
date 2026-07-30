import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

const url = process.env.TEST_SUPABASE_URL;
const anon = process.env.TEST_SUPABASE_ANON_KEY;
const tenantAEmail = process.env.TEST_TENANT_A_EMAIL;
const tenantAPassword = process.env.TEST_TENANT_A_PASSWORD;
const tenantBId = process.env.TEST_TENANT_B_ID;
const storagePathA = process.env.TEST_STORAGE_JUSTIFICATION_PATH_A;
const storagePathB = process.env.TEST_STORAGE_JUSTIFICATION_PATH_B;
const gateRequired = process.env.CI === "true" || process.env.PRODUCTION_SECURITY_GATES === "true";
const configured = Boolean(url && anon && tenantAEmail && tenantAPassword && tenantBId);

if (gateRequired && !configured) {
  throw new Error("RLS/Storage integration tests require TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY, TEST_TENANT_A_EMAIL, TEST_TENANT_A_PASSWORD and TEST_TENANT_B_ID.");
}

const describeIfConfigured = configured ? describe : describe.skip;

async function tenantAClient() {
  const client = createClient(url!, anon!, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email: tenantAEmail!, password: tenantAPassword! });
  expect(error).toBeNull();
  return client;
}

describeIfConfigured("RLS multitenant against a real Supabase test project", () => {
  it("prevents tenant A from reading employees from tenant B", async () => {
    const client = await tenantAClient();
    const { data, error } = await client.from("employees").select("id,tenant_id").eq("tenant_id", tenantBId!);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("prevents tenant A from inserting an employee into tenant B", async () => {
    const client = await tenantAClient();
    const { error } = await client.from("employees").insert({
      tenant_id: tenantBId,
      full_name: "RLS probe",
      role: "probe",
      branch_id: "00000000-0000-0000-0000-000000000000",
    });
    expect(error).not.toBeNull();
  });

  it("prevents tenant A from reading new v5.3 ledgers from tenant B", async () => {
    const client = await tenantAClient();
    for (const table of [
      "clock_risk_events",
      "time_clock_receipts",
      "time_entry_adjustments",
      "payroll_state_transitions",
      "background_job_events",
      "privacy_requests",
    ]) {
      const { data, error } = await client.from(table).select("tenant_id").eq("tenant_id", tenantBId!);
      expect(error, `${table} must exist and accept isolated queries`).toBeNull();
      expect(data, `${table} must not leak tenant B rows`).toEqual([]);
    }
  });
});

describeIfConfigured("Storage A/B isolation against a real Supabase test project", () => {
  it("allows tenant A to read an authorized object metadata path when fixture is configured", async () => {
    if (!storagePathA) {
      if (gateRequired) throw new Error("TEST_STORAGE_JUSTIFICATION_PATH_A is required in production gates.");
      return;
    }
    const client = await tenantAClient();
    const { data, error } = await client.storage.from("justificativas").list(storagePathA.split("/").slice(0, -1).join("/"), { limit: 10 });
    expect(error).toBeNull();
    expect(data).toBeTruthy();
  });

  it("prevents tenant A from listing tenant B storage prefix", async () => {
    if (!storagePathB) {
      if (gateRequired) throw new Error("TEST_STORAGE_JUSTIFICATION_PATH_B is required in production gates.");
      return;
    }
    const client = await tenantAClient();
    const prefix = storagePathB.split("/").slice(0, -1).join("/");
    const { data, error } = await client.storage.from("justificativas").list(prefix, { limit: 10 });
    expect(error || data?.length === 0).toBeTruthy();
  });

  it("prevents tenant A from creating an object under tenant B prefix", async () => {
    const client = await tenantAClient();
    const target = `${tenantBId}/justifications/00000000-0000-0000-0000-000000000000/probe.txt`;
    const { error } = await client.storage.from("justificativas").upload(target, new Blob(["probe"], { type: "text/plain" }));
    expect(error).not.toBeNull();
  });
});
