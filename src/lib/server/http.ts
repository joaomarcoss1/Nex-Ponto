import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  isApplicationErrorCode,
  type ApplicationErrorCode,
  type ApplicationErrorResponse,
} from "@/lib/contracts/application-errors";

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
  const payload: ApplicationErrorResponse = {
    error: message,
    code: isApplicationErrorCode(explicitCode) ? explicitCode : fallbackCode,
    correlationId: randomUUID(),
  };
  if (process.env.NODE_ENV !== "production" && details !== undefined) payload.details = details;
  return NextResponse.json(payload, { status });
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
