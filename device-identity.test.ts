import { afterEach, describe, expect, it, vi } from "vitest";
import { evaluateDevicePolicy } from "@/lib/security/device-identity";

describe("evaluateDevicePolicy", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("bloqueia dispositivo revogado em qualquer modo", () => {
    expect(evaluateDevicePolicy("free", "revoked")).toMatchObject({
      allowed: false,
      reason: "DEVICE_NOT_AUTHORIZED",
    });
  });

  it("encaminha dispositivo novo para revisão no modo monitorado", () => {
    expect(evaluateDevicePolicy("monitored", "pending")).toEqual({
      allowed: true,
      review: true,
      reason: "NEW_DEVICE_REVIEW",
    });
  });

  it("exige aprovação no modo obrigatório", () => {
    expect(evaluateDevicePolicy("required", null).allowed).toBe(false);
    expect(evaluateDevicePolicy("required", "active").allowed).toBe(true);
  });
});
