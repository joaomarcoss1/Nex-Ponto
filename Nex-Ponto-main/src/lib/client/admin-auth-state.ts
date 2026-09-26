export type AdminAuthFailureAction = "login" | "tenant_selection" | "temporary_error" | "fatal_error";

const SESSION_CODES = new Set([
  "AUTHENTICATION_REQUIRED",
  "AUTH_SESSION_REQUIRED",
  "AUTH_SESSION_INVALID",
]);

const TEMPORARY_CODES = new Set([
  "AUTH_PROVIDER_UNAVAILABLE",
  "DATABASE_ERROR",
  "ENVIRONMENT_NOT_READY",
  "MIGRATION_NOT_READY",
  "STORAGE_NOT_READY",
  "TIMEOUT",
  "INTERNAL_ERROR",
]);

export function classifyAdminAuthFailure(status: number | undefined, code: string | undefined): AdminAuthFailureAction {
  if (status === 401 && (!code || SESSION_CODES.has(code))) return "login";
  if (status === 409 && code === "TENANT_SELECTION_REQUIRED") return "tenant_selection";
  if (status === 408 || status === 425 || status === 429 || (status !== undefined && status >= 500) || (code && TEMPORARY_CODES.has(code))) {
    return "temporary_error";
  }
  return "fatal_error";
}
