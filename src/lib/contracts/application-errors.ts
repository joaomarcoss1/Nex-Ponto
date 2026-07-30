export const APPLICATION_ERROR_CODES = [
  "AUTHENTICATION_REQUIRED",
  "MFA_REQUIRED",
  "STEP_UP_REQUIRED",
  "PERMISSION_DENIED",
  "TENANT_NOT_FOUND",
  "TENANT_SUSPENDED",
  "TENANT_SELECTION_REQUIRED",
  "BRANCH_ACCESS_DENIED",
  "EMPLOYEE_NOT_FOUND",
  "INVALID_TIME_ACTION",
  "DEVICE_NOT_AUTHORIZED",
  "GEOFENCE_VIOLATION",
  "PAYROLL_PERIOD_LOCKED",
  "DIVERGENCE_PENDING",
  "OFFICIAL_PAYROLL_DISABLED",
  "RATE_LIMITED",
  "VALIDATION_FAILED",
  "NOT_FOUND",
  "CONFLICT",
  "INTERNAL_ERROR",
] as const;

export type ApplicationErrorCode = (typeof APPLICATION_ERROR_CODES)[number];

export type ApplicationErrorResponse = {
  error: string;
  code: ApplicationErrorCode;
  correlationId: string;
  fields?: Record<string, string[]>;
  details?: unknown;
};

export function isApplicationErrorCode(value: unknown): value is ApplicationErrorCode {
  return typeof value === "string"
    && (APPLICATION_ERROR_CODES as readonly string[]).includes(value);
}
