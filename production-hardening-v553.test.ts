import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/056_nexponto_v553_production_hardening.sql", "utf8");

describe("production hardening migration v5.5.3", () => {
  it("enforces one business credit per overtime review", () => {
    expect(migration).toMatch(/unique index if not exists uq_hour_bank_overtime_review_v553/i);
    expect(migration).toMatch(/bank_delta:=desired_bank-old_bank/i);
    expect(migration).toMatch(/overtime_adjustment/i);
  });

  it("protects tenant identity and job leases", () => {
    expect(migration).toMatch(/TENANT_MUTATION_FORBIDDEN/);
    expect(migration).toMatch(/fk_membership_admin_identity_v553/);
    expect(migration).toMatch(/JOB_LEASE_LOST/);
  });
});
