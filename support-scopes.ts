import type { Permission } from "@/lib/security/authorization";

export const SUPPORT_SCOPES = [
  "support_read",
  "support_operational",
  "support_financial",
  "full_access",
] as const;

export type SupportScope = (typeof SUPPORT_SCOPES)[number];

const READ: Permission[] = [
  "payroll.view",
  "audit.view",
];

const OPERATIONAL: Permission[] = [
  ...READ,
  "branch.manage",
  "employee.manage",
  "schedule.manage",
  "time_entry.review",
  "overtime.review",
  "time_bank.manage",
  "branding.manage",
  "reports.export",
];

const FINANCIAL: Permission[] = [
  ...READ,
  "payroll.calculate",
  "payroll.resolve_divergence",
  "payroll.export",
  "financial.view",
  "reports.export",
];

export function permissionsForSupportScopes(
  scopes: readonly string[] | null | undefined,
  allPermissions: readonly Permission[],
): Permission[] {
  const safe = new Set(scopes?.filter((scope): scope is SupportScope =>
    (SUPPORT_SCOPES as readonly string[]).includes(scope),
  ) ?? []);
  if (safe.has("full_access")) return [...allPermissions].filter((permission) => permission !== "payroll.mark_paid");
  const result = new Set<Permission>();
  if (safe.has("support_read")) READ.forEach((permission) => result.add(permission));
  if (safe.has("support_operational")) OPERATIONAL.forEach((permission) => result.add(permission));
  if (safe.has("support_financial")) FINANCIAL.forEach((permission) => result.add(permission));
  return [...result];
}

export function supportScopeRequiresStepUp(scopes: readonly string[]) {
  return scopes.includes("support_financial") || scopes.includes("full_access");
}
