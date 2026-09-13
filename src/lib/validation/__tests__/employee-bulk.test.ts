import { describe, expect, it } from "vitest";
import { employeeBulkRequestSchema } from "@/lib/validation/employee-bulk";

const employeeId = "11111111-1111-4111-8111-111111111111";

describe("employee bulk contract", () => {
  it("accepts only explicitly supported business fields", () => {
    expect(employeeBulkRequestSchema.safeParse({ ids: [employeeId], patch: { role: "Analista", active: true } }).success).toBe(true);
  });

  it.each(["id", "tenant_id", "auth_user_id", "pin_hash", "created_at", "updated_at", "deleted_at", "created_by", "updated_by"])(
    "rejects protected field %s with a strict schema",
    (field) => {
      const result = employeeBulkRequestSchema.safeParse({ ids: [employeeId], patch: { [field]: "22222222-2222-4222-8222-222222222222" } });
      expect(result.success).toBe(false);
    },
  );

  it("rejects unknown top-level fields and oversized batches", () => {
    expect(employeeBulkRequestSchema.safeParse({ ids: [employeeId], patch: {}, unexpected: true }).success).toBe(false);
    expect(employeeBulkRequestSchema.safeParse({ ids: Array.from({ length: 501 }, () => employeeId), patch: {} }).success).toBe(false);
  });

  it("rejects generatePins combined with patch.pin or another bulk patch", () => {
    const pinConflict = employeeBulkRequestSchema.safeParse({ ids: [employeeId], generatePins: true, patch: { pin: "1234" } });
    expect(pinConflict.success).toBe(false);
    if (!pinConflict.success) expect(pinConflict.error.issues.some((issue) => issue.message.includes("mutuamente exclusivos"))).toBe(true);

    expect(employeeBulkRequestSchema.safeParse({ ids: [employeeId], generatePins: true, patch: { role: "Analista" } }).success).toBe(false);
    expect(employeeBulkRequestSchema.safeParse({ ids: [employeeId], generatePins: true, patch: {} }).success).toBe(true);
  });
});
