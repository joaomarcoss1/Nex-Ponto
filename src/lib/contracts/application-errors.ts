export const APPLICATION_ERROR_CODES = [
  "AUTHENTICATION_REQUIRED",
  "AUTH_SESSION_REQUIRED",
  "AUTH_SESSION_INVALID",
  "AUTH_PROVIDER_UNAVAILABLE",
  "STEP_UP_REQUIRED",
  "PERMISSION_DENIED",
  "TENANT_NOT_FOUND",
  "TENANT_INACTIVE",
  "TENANT_SUSPENDED",
  "TENANT_SELECTION_REQUIRED",
  "MEMBERSHIP_NOT_FOUND",
  "MEMBERSHIP_INACTIVE",
  "ADMIN_PROFILE_NOT_FOUND",
  "ADMIN_PROFILE_INACTIVE",
  "BRANCH_ACCESS_DENIED",
  "EMPLOYEE_NOT_FOUND",
  "INVALID_TIME_ACTION",
  "DEVICE_NOT_AUTHORIZED",
  "GEOFENCE_VIOLATION",
  "PAYROLL_PERIOD_LOCKED",
  "DIVERGENCE_PENDING",
  "OFFICIAL_PAYROLL_DISABLED",
  "RATE_LIMITED",
  "ENVIRONMENT_NOT_READY",
  "DATABASE_ERROR",
  "MIGRATION_NOT_READY",
  "STORAGE_NOT_READY",
  "TIMEOUT",
  "VALIDATION_FAILED",
  "NOT_FOUND",
  "CONFLICT",
  "INTERNAL_ERROR",
] as const;

export type ApplicationErrorCode = (typeof APPLICATION_ERROR_CODES)[number];

export type ApplicationErrorResponse = {
  ok: false;
  error: {
    code: ApplicationErrorCode;
    message: string;
    requestId: string;
    retryable: boolean;
  };
  code: ApplicationErrorCode;
  correlationId: string;
  requestId: string;
  message: string;
  fields?: Record<string, string[]>;
  details?: unknown;
};

export function isApplicationErrorCode(value: unknown): value is ApplicationErrorCode {
  return typeof value === "string"
    && (APPLICATION_ERROR_CODES as readonly string[]).includes(value);
}
