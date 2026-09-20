import { describe, expect, it } from "vitest";
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
});
