import { describe, expect, it } from "vitest";
import { ApiClientError, apiErrorFromPayload } from "@/lib/client/api-error";

describe("API error contract", () => {
  it("reads the v5.4 nested contract", () => {
    const error = apiErrorFromPayload({
      error: { code: "RATE_LIMITED", message: "Tente novamente.", requestId: "req-1", retryable: true },
    }, 429);

    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({
      message: "Tente novamente.",
      code: "RATE_LIMITED",
      requestId: "req-1",
      retryable: true,
      status: 429,
    });
  });

  it("keeps temporary compatibility with legacy responses", () => {
    expect(apiErrorFromPayload({ error: "Sessão expirada." }, 401).message).toBe("Sessão expirada.");
  });

  it("redacts legacy technical configuration errors before rendering", () => {
    const error = apiErrorFromPayload({
      error: "RATE_LIMIT_HASH_SALT ou TENANT_CONTEXT_SECRET deve possuir ao menos 32 caracteres.",
      correlationId: "req-safe",
    }, 503);

    expect(error.message).toBe("Serviço temporariamente indisponível. Informe o requestId req-safe ao suporte.");
    expect(error.message).not.toMatch(/RATE_LIMIT_HASH_SALT|TENANT_CONTEXT_SECRET/);
  });
});
