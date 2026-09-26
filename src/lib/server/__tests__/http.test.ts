import { describe, expect, it, vi } from "vitest";
import { fail, sanitizePublicErrorMessage } from "@/lib/server/http";

describe("server error sanitization", () => {
  it("redacts secret names from public messages", () => {
    expect(sanitizePublicErrorMessage("RATE_LIMIT_HASH_SALT ou TENANT_CONTEXT_SECRET deve possuir ao menos 32 caracteres.", 503))
      .toBe("Serviço temporariamente indisponível. Contate o suporte e informe o requestId.");
  });

  it("keeps infrastructure errors generic for 5xx responses", () => {
    expect(sanitizePublicErrorMessage('relation "public.clock_entries" does not exist', 500))
      .toBe("Não foi possível concluir a operação agora. Contate o suporte e informe o requestId.");
  });

  it("does not expose technical details in the API contract", async () => {
    const response = fail(
      "RATE_LIMIT_HASH_SALT ou TENANT_CONTEXT_SECRET deve possuir ao menos 32 caracteres.",
      503,
      "TENANT_CONTEXT_SECRET ausente",
    );
    const body = await response.json();

    expect(body.ok).toBe(false);
    expect(body.error.message).not.toMatch(/RATE_LIMIT_HASH_SALT|TENANT_CONTEXT_SECRET/);
    expect(body.message).toBe(body.error.message);
    expect(body.requestId).toBe(body.error.requestId);
    expect(body.details).toEqual({ redacted: true });
  });

  it("always exposes field-level validation errors, even in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      const response = fail("Revise os dados da filial.", 400, {
        formErrors: [],
        fieldErrors: { latitude: ["Number must be greater than or equal to -90"], branch_id: ["Required"] },
      });
      const body = await response.json();
      expect(body.fields).toEqual({
        latitude: ["Number must be greater than or equal to -90"],
        branch_id: ["Required"],
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
