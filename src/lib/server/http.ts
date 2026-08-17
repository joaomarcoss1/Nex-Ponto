import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  isApplicationErrorCode,
  type ApplicationErrorCode,
  type ApplicationErrorResponse,
} from "@/lib/contracts/application-errors";
import { structuredLog } from "@/lib/observability/logger";

const SENSITIVE_ERROR_PATTERN = /\b([A-Z0-9_]*(SECRET|SALT|TOKEN|KEY|PASSWORD|SERVICE_ROLE)[A-Z0-9_]*|NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY)\b/i;
const SAFE_CONFIGURATION_MESSAGE = "Serviço temporariamente indisponível. Contate o suporte e informe o requestId.";
const SAFE_PUBLIC_SERVER_MESSAGE_PATTERN = /^(Erro ao|Não foi possível|Falha ao|Serviço|Sistema|Operação|A busca|O trabalho|Esta|Este|Sessão|Comprovante|Empresa|Filial|Funcionário|Perfil|QR|Credencial|Token|Corpo JSON)/i;
const REQUEST_IDS = new WeakMap<Request, string>();

export function sanitizePublicErrorMessage(message: string, status = 500) {
  const value = String(message || "").trim();
  if (!value) return status >= 500 ? "Não foi possível concluir a operação agora." : "Revise os dados informados.";
  if (SENSITIVE_ERROR_PATTERN.test(value)) return SAFE_CONFIGURATION_MESSAGE;
  if (/ENVIRONMENT_NOT_READY|SERVER_CONFIGURATION|RATE_LIMIT_CONFIGURATION|not configured|nao configurado|não configurado|configuracao.*incompleta|configuração.*incompleta/i.test(value)) {
    return SAFE_CONFIGURATION_MESSAGE;
  }
  if (status >= 500 && !SAFE_PUBLIC_SERVER_MESSAGE_PATTERN.test(value)) {
    return "Não foi possível concluir a operação agora. Contate o suporte e informe o requestId.";
  }
  return value;
}

function requestIdFromDetails(details: unknown) {
  return details && typeof details === "object" && "requestId" in details
    ? String((details as { requestId?: unknown }).requestId || "")
    : "";
}

export function requestIdFromRequest(request: Request) {
  const cached = REQUEST_IDS.get(request);
  if (cached) return cached;
  const value = request.headers.get("x-request-id") || "";
  const requestId = /^[a-zA-Z0-9._:-]{8,120}$/.test(value) ? value : randomUUID();
  REQUEST_IDS.set(request, requestId);
  return requestId;
}

function sanitizeDetails(details: unknown) {
  if (details === undefined) return undefined;
  if (details && typeof details === "object" && "requestId" in details) {
    const { requestId: _requestId, ...rest } = details as Record<string, unknown>;
    details = Object.keys(rest).length ? rest : undefined;
    if (details === undefined) return undefined;
  }
  let serialized = "";
  try {
    serialized = typeof details === "string" ? details : JSON.stringify(details);
  } catch {
    return { redacted: true };
  }
  if (SENSITIVE_ERROR_PATTERN.test(serialized)) return { redacted: true };
  return details;
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(message: string, status = 400, details?: unknown) {
  const explicitCode = details && typeof details === "object" && "code" in details
    ? (details as { code?: unknown }).code
    : undefined;
  const fallbackCode: ApplicationErrorCode = status === 401
    ? "AUTHENTICATION_REQUIRED"
    : status === 403
      ? "PERMISSION_DENIED"
      : status === 404
        ? "NOT_FOUND"
        : status === 409
          ? "CONFLICT"
          : status === 429
            ? "RATE_LIMITED"
            : status >= 500
              ? "INTERNAL_ERROR"
              : "VALIDATION_FAILED";
  const code = isApplicationErrorCode(explicitCode) ? explicitCode : fallbackCode;
  const suppliedRequestId = requestIdFromDetails(details);
  const requestId = suppliedRequestId || randomUUID();
  const retryable = status === 408 || status === 425 || status === 429 || status >= 500;
  const publicMessage = sanitizePublicErrorMessage(message, status);
  const payload: ApplicationErrorResponse = {
    ok: false,
    error: { code, message: publicMessage, requestId, retryable },
    code,
    correlationId: requestId,
    requestId,
    message: publicMessage,
  };
  const safeDetails = sanitizeDetails(details);
  if (process.env.NODE_ENV !== "production" && safeDetails !== undefined) payload.details = safeDetails;
  if (status >= 500) structuredLog("error", "api_request_failed", { requestId, code, status, details });
  return NextResponse.json(payload, { status, headers: { "x-request-id": requestId } });
}

export function failForRequest(request: Request, message: string, status = 400, details?: unknown) {
  return fail(message, status, {
    ...(details && typeof details === "object" ? details as Record<string, unknown> : { technicalMessage: details }),
    requestId: requestIdFromRequest(request),
  });
}

export async function readJson<T = Record<string, unknown>>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new Error("Corpo JSON inválido.");
  }
}

export function searchParam(request: Request, name: string) {
  return new URL(request.url).searchParams.get(name);
}
