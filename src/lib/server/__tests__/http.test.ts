import { describe, expect, it } from "vitest";
import { fail, failForRequest, requestIdFromRequest, sanitizePublicErrorMessage } from "@/lib/server/http";

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
      { technicalMessage: "TENANT_CONTEXT_SECRET ausente", requestId: "req-v55-test" },
    );
    const body = await response.json();

    expect(body.ok).toBe(false);
    expect(body.error.message).not.toMatch(/RATE_LIMIT_HASH_SALT|TENANT_CONTEXT_SECRET/);
    expect(body.message).toBe(body.error.message);
    expect(body.requestId).toBe(body.error.requestId);
    expect(body.requestId).toBe("req-v55-test");
    expect(response.headers.get("x-request-id")).toBe("req-v55-test");
    expect(body.details).toEqual({ redacted: true });
  });

  it("uses the same supplied request id for helpers, logs and response contract", async () => {
    const request = new Request("https://nexponto.test/api/fail", { headers: { "x-request-id": "test-12345" } });
    expect(requestIdFromRequest(request)).toBe("test-12345");
    expect(requestIdFromRequest(request)).toBe("test-12345");

    const response = failForRequest(request, "Falha controlada.", 500, { technicalMessage: "controlled" });
    const body = await response.json();
    expect(body.requestId).toBe("test-12345");
    expect(body.error.requestId).toBe("test-12345");
    expect(response.headers.get("x-request-id")).toBe("test-12345");
  });
});
