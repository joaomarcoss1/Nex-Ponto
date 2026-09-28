import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { PATCH as payrollItemsPatch } from "@/app/api/admin/payroll-items/route";
import { PATCH as payrollPatch, POST as payrollPost } from "@/app/api/admin/payroll/route";

/**
 * Migration 037 marked every tenant's legacy payroll engine as
 * write-blocked ("Motor profissional v5.1 é a fonte única para novas
 * gerações"), but nothing ever called the DB-side enforcement function
 * (assert_legacy_payroll_write_allowed_v51 has zero callers, in the app or
 * in any other Postgres function). The actual enforcement lives here, at
 * the route layer. This test is a regression guard: it fails loudly if any
 * of these three legacy write endpoints is ever re-enabled (or a new one
 * added to /admin/folha-legada) without an explicit decision to do so.
 */
describe("legacy payroll engine write endpoints stay disabled", () => {
  const request = new NextRequest("http://localhost/api/admin/payroll", { method: "POST" });

  it("blocks folha generation (POST /api/admin/payroll)", async () => {
    const response = await payrollPost(request);
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.code).toBe("LEGACY_PAYROLL_READ_ONLY");
  });

  it("blocks period status changes (PATCH /api/admin/payroll)", async () => {
    const response = await payrollPatch(request);
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.code).toBe("LEGACY_PAYROLL_READ_ONLY");
  });

  it("blocks manual item value edits (PATCH /api/admin/payroll-items)", async () => {
    const response = await payrollItemsPatch(request);
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.code).toBe("LEGACY_PAYROLL_READ_ONLY");
  });
});
