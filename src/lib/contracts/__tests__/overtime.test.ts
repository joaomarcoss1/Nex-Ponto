import { describe, expect, it } from "vitest";
import { overtimeApprovalSchema } from "@/lib/contracts/overtime";

const id = "11111111-1111-4111-8111-111111111111";

describe("overtime contract", () => {
  it("accepts automatic calculation when manual amount is absent", () => {
    const result = overtimeApprovalSchema.parse({
      id,
      status: "approved",
      approved_overtime_minutes: 60,
      destination: "payment",
      payment_minutes: 60,
      bank_minutes: 0,
    });
    expect(result.approved_amount).toBeNull();
  });

  it("rejects a split that does not reconcile", () => {
    const result = overtimeApprovalSchema.safeParse({
      id,
      status: "approved",
      approved_overtime_minutes: 60,
      destination: "split",
      payment_minutes: 20,
      bank_minutes: 20,
    });
    expect(result.success).toBe(false);
  });
});

