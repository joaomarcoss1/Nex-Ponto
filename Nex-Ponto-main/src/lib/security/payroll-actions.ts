import type { Permission } from "@/lib/security/authorization";

export type PayrollAction =
  | "create_period"
  | "create"
  | "calculate"
  | "resolve_divergence"
  | "transition";

export type PayrollTransition =
  | "attendance_pending"
  | "calculated"
  | "checking"
  | "hr_approved"
  | "financial_approved"
  | "closed"
  | "closed_with_exceptions"
  | "exported"
  | "paid"
  | "reopened";

const TRANSITION_PERMISSIONS: Record<PayrollTransition, Permission> = {
  attendance_pending: "payroll.calculate",
  calculated: "payroll.calculate",
  checking: "payroll.calculate",
  hr_approved: "payroll.hr_approve",
  financial_approved: "payroll.financial_approve",
  closed: "payroll.close",
  closed_with_exceptions: "payroll.close",
  exported: "payroll.export",
  paid: "payroll.mark_paid",
  reopened: "payroll.reopen",
};

export function requiredPayrollPermission(
  action: PayrollAction,
  targetStatus?: PayrollTransition,
): Permission {
  if (action === "resolve_divergence") return "payroll.resolve_divergence";
  if (action === "transition") {
    if (!targetStatus) throw new Error("Transição de pré-folha sem estado de destino.");
    return TRANSITION_PERMISSIONS[targetStatus];
  }
  return "payroll.calculate";
}

export function officialPayrollEnabled() {
  return process.env.FEATURE_OFFICIAL_PAYROLL === "true";
}

export function assertPayrollActionAvailable(
  permissions: readonly string[],
  action: PayrollAction,
  targetStatus?: PayrollTransition,
) {
  const permission = requiredPayrollPermission(action, targetStatus);
  if (targetStatus === "paid" && !officialPayrollEnabled()) {
    return {
      allowed: false as const,
      permission,
      reason: "A pré-folha não pode ser marcada como paga enquanto a folha oficial estiver desativada.",
    };
  }
  return permissions.includes(permission)
    ? { allowed: true as const, permission }
    : {
        allowed: false as const,
        permission,
        reason: `A operação exige a permissão ${permission}.`,
      };
}

