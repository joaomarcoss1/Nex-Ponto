export type ApiErrorPayload = {
  error?: string | { code?: string; message?: string; requestId?: string; retryable?: boolean };
  message?: string;
  code?: string;
  correlationId?: string;
  requestId?: string;
};

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly code = "UNKNOWN_ERROR",
    readonly requestId?: string,
    readonly retryable = false,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

const SENSITIVE_CLIENT_ERROR_PATTERN = /\b([A-Z0-9_]*(SECRET|SALT|TOKEN|KEY|PASSWORD|SERVICE_ROLE)[A-Z0-9_]*|NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY)\b/i;

function safeClientMessage(message: string | undefined, requestId: string | undefined, fallback: string) {
  const value = String(message || fallback).trim();
  if (
    SENSITIVE_CLIENT_ERROR_PATTERN.test(value) ||
    /ENVIRONMENT_NOT_READY|SERVER_CONFIGURATION|RATE_LIMIT_CONFIGURATION|not configured|nao configurado|não configurado|configuracao.*incompleta|configuração.*incompleta/i.test(value)
  ) {
    return `Serviço temporariamente indisponível.${requestId ? ` Informe o requestId ${requestId} ao suporte.` : " Tente novamente em instantes."}`;
  }
  return value;
}

export function apiErrorFromPayload(payload: unknown, status?: number, fallback = "Não foi possível concluir a operação.") {
  const data = payload && typeof payload === "object" ? payload as ApiErrorPayload : {};
  const nested = data.error && typeof data.error === "object" ? data.error : undefined;
  const legacy = typeof data.error === "string" ? data.error : undefined;
  const requestId = nested?.requestId || data.requestId || data.correlationId;
  return new ApiClientError(
    safeClientMessage(nested?.message || legacy || data.message, requestId, fallback),
    nested?.code || data.code || "UNKNOWN_ERROR",
    requestId,
    Boolean(nested?.retryable),
    status,
  );
}
