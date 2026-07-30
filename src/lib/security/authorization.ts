import type { AdminRole } from "@/types/domain";

export const PERMISSIONS = [
  "tenant.manage",
  "branch.manage",
  "employee.view",
  "employee.manage",
  "schedule.view",
  "schedule.manage",
  "time_entry.view",
  "time_entry.review",
  "justification.view",
  "justification.review",
  "overtime.view",
  "overtime.review",
  "time_bank.view",
  "time_bank.manage",
  "payroll.view",
  "payroll.calculate",
  "payroll.approve",
  "payroll.resolve_divergence",
  "payroll.hr_approve",
  "payroll.financial_approve",
  "payroll.close",
  "payroll.export",
  "payroll.reopen",
  "payroll.mark_paid",
  "reports.export",
  "audit.view",
  "branding.manage",
  "administrators.manage",
  "financial.view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];
export type PermissionRequirement = {
  all?: Permission[];
  any?: Permission[];
};

const ALL_TENANT_PERMISSIONS = [...PERMISSIONS];

const ROLE_PERMISSIONS: Record<AdminRole, readonly Permission[]> = {
  platform_superadmin: [],
  tenant_owner: ALL_TENANT_PERMISSIONS,
  tenant_admin: ALL_TENANT_PERMISSIONS,
  hr_manager: [
    "branch.manage", "employee.view", "employee.manage", "schedule.view", "schedule.manage", "time_entry.view", "time_entry.review",
    "justification.view", "justification.review", "overtime.view", "overtime.review", "time_bank.view", "time_bank.manage", "payroll.view", "payroll.calculate",
    "payroll.resolve_divergence", "payroll.hr_approve", "payroll.export",
    "reports.export", "audit.view", "financial.view",
  ],
  payroll_manager: [
    "overtime.view", "overtime.review", "time_bank.view", "time_bank.manage", "payroll.view", "payroll.calculate",
    "payroll.approve", "payroll.resolve_divergence", "payroll.financial_approve",
    "payroll.close", "payroll.export", "payroll.reopen", "reports.export", "financial.view",
  ],
  rh_admin: [
    "branch.manage", "employee.view", "employee.manage", "schedule.view", "schedule.manage", "time_entry.view", "time_entry.review",
    "justification.view", "justification.review", "overtime.view", "overtime.review", "time_bank.view", "time_bank.manage", "payroll.view", "payroll.calculate",
    "reports.export", "financial.view",
  ],
  rh_analyst: [
    "employee.view", "employee.manage", "schedule.view", "schedule.manage", "time_entry.view", "time_entry.review",
    "justification.view", "justification.review", "overtime.view", "overtime.review",
    "time_bank.view", "time_bank.manage", "payroll.view", "reports.export",
  ],
  finance_admin: [
    "overtime.view", "overtime.review", "time_bank.view", "time_bank.manage", "payroll.view", "payroll.calculate",
    "payroll.approve", "payroll.resolve_divergence", "payroll.financial_approve",
    "payroll.close", "payroll.export", "payroll.reopen", "reports.export", "financial.view",
  ],
  regional_manager: [
    "branch.manage", "employee.view", "employee.manage", "schedule.view", "schedule.manage", "time_entry.view", "time_entry.review",
    "justification.view", "justification.review", "overtime.view", "overtime.review", "time_bank.view", "time_bank.manage", "reports.export",
  ],
  branch_manager: [
    "employee.view", "employee.manage", "schedule.view", "schedule.manage", "time_entry.view", "time_entry.review",
    "justification.view", "justification.review", "overtime.view", "overtime.review", "time_bank.view", "time_bank.manage", "reports.export",
  ],
  department_leader: ["schedule.view", "schedule.manage", "time_entry.view", "time_entry.review", "justification.view", "justification.review", "overtime.view", "overtime.review"],
  auditor: ["payroll.view", "reports.export", "audit.view", "financial.view"],
  employee: [],
  master_admin: ALL_TENANT_PERMISSIONS,
  admin: [
    "branch.manage", "employee.view", "employee.manage", "schedule.view", "schedule.manage", "time_entry.view", "time_entry.review",
    "justification.view", "justification.review", "overtime.view", "overtime.review", "time_bank.view", "time_bank.manage", "payroll.view", "reports.export",
  ],
  admin_geral: ALL_TENANT_PERMISSIONS,
  gerente_filial: [
    "employee.view", "employee.manage", "schedule.view", "schedule.manage", "time_entry.view", "time_entry.review",
    "justification.view", "justification.review", "overtime.view", "overtime.review", "time_bank.view", "time_bank.manage", "reports.export",
  ],
  rh_financeiro: [
    "employee.view", "employee.manage", "schedule.view", "schedule.manage", "time_entry.view", "time_entry.review",
    "justification.view", "justification.review", "overtime.view", "overtime.review", "time_bank.view", "time_bank.manage", "payroll.view", "payroll.calculate", "payroll.approve",
    "payroll.resolve_divergence", "payroll.hr_approve", "payroll.financial_approve",
    "payroll.close", "payroll.export", "payroll.reopen", "reports.export", "financial.view",
  ],
};

const LEGACY_ROLE_ALIASES: Partial<Record<AdminRole, AdminRole>> = {
  master_admin: "tenant_owner",
  admin_geral: "tenant_admin",
  admin: "tenant_admin",
  gerente_filial: "branch_manager",
  rh_financeiro: "payroll_manager",
  rh_admin: "hr_manager",
  finance_admin: "payroll_manager",
};

export function canonicalRole(role: AdminRole): AdminRole {
  return LEGACY_ROLE_ALIASES[role] ?? role;
}

export function resolvePermissions(role: AdminRole, explicit: readonly string[] | null | undefined): Permission[] {
  if (explicit?.includes("*")) return [...ALL_TENANT_PERMISSIONS];
  const granted = new Set<Permission>(ROLE_PERMISSIONS[role] ?? []);
  for (const value of explicit ?? []) {
    if ((PERMISSIONS as readonly string[]).includes(value)) granted.add(value as Permission);
  }
  return [...granted];
}

export function hasPermission(granted: readonly string[], requirement: PermissionRequirement): boolean {
  const set = new Set(granted);
  if (requirement.all?.some((permission) => !set.has(permission))) return false;
  if (requirement.any?.length && !requirement.any.some((permission) => set.has(permission))) return false;
  return true;
}

export function legacyRoleRequirement(allowedRoles: readonly AdminRole[]): PermissionRequirement | null {
  if (!allowedRoles.length) return null;
  const permissions = new Set<Permission>();
  for (const role of allowedRoles) {
    for (const permission of ROLE_PERMISSIONS[role] ?? []) permissions.add(permission);
  }
  return permissions.size ? { any: [...permissions] } : null;
}
