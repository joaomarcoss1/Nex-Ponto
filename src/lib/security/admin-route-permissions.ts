import type { Permission, PermissionRequirement } from "@/lib/security/authorization";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type RoutePermissionRule = {
  prefix: string;
  methods?: Partial<Record<HttpMethod, PermissionRequirement>>;
  fallback?: PermissionRequirement;
};

const all = (...permissions: Permission[]): PermissionRequirement => ({ all: permissions });
const any = (...permissions: Permission[]): PermissionRequirement => ({ any: permissions });

export const ADMIN_NAV_PERMISSION_BY_PATH: Record<string, PermissionRequirement> = {
  "/admin": any("time_entry.view", "employee.view", "payroll.view", "reports.export", "audit.view"),
  "/admin/funcionarios": any("employee.view", "employee.manage"),
  "/admin/funcionarios/importar": all("employee.manage"),
  "/admin/gerencia-filial": any("branch.view", "branch.manage"),
  "/admin/filiais": any("branch.view", "branch.manage"),
  "/admin/horarios": any("schedule.view", "schedule.manage"),
  "/admin/modelos-turno": any("schedule.view", "schedule.manage"),
  "/admin/planejamento-escalas": any("schedule.view", "schedule.manage"),
  "/admin/escalas-profissionais": any("schedule.view", "schedule.manage"),
  "/admin/pontos": any("time_entry.view", "time_entry.review"),
  "/admin/revisoes-ponto": all("time_entry.review"),
  "/admin/horas-extras": all("overtime.review"),
  "/admin/inconsistencias": any("inconsistency.view", "inconsistency.review", "time_entry.review"),
  "/admin/justificativas": any("justification.view", "justification.review", "time_entry.review"),
  "/admin/feriados": any("schedule.view", "schedule.manage"),
  "/admin/folha": all("payroll.view"),
  "/admin/fechamento": any("payroll.approve", "payroll.close"),
  "/admin/banco-de-horas": any("time_bank.view", "time_bank.manage"),
  "/admin/solicitacoes": any("schedule.view", "schedule.manage"),
  "/admin/relatorios": any("reports.export", "payroll.export"),
  "/admin/onboarding": all("tenant.manage"),
  "/admin/configuracoes": all("tenant.manage"),
  "/admin/administradores": any("administrators.view", "administrators.manage"),
  "/admin/auditoria": all("audit.view"),
  "/admin/seguranca": all("audit.view"),
};

const ADMIN_ROUTE_RULES: RoutePermissionRule[] = [
  { prefix: "/api/admin/me", fallback: any("tenant.view", "employee.view", "time_entry.view", "payroll.view", "audit.view") },
  { prefix: "/api/admin/bootstrap", fallback: all("tenant.manage") },
  { prefix: "/api/admin/admins", methods: { GET: any("administrators.view", "administrators.manage") }, fallback: all("administrators.manage") },
  { prefix: "/api/admin/audit", fallback: all("audit.view") },
  { prefix: "/api/admin/branches/readiness", fallback: any("branch.view", "branch.manage") },
  { prefix: "/api/admin/branches/gps-validation", fallback: all("branch.manage") },
  { prefix: "/api/admin/branches/with-hours", fallback: all("branch.manage") },
  { prefix: "/api/admin/branches", methods: { GET: any("branch.view", "branch.manage") }, fallback: all("branch.manage") },
  { prefix: "/api/admin/branch-hours", methods: { GET: any("branch.view", "branch.manage") }, fallback: all("branch.manage") },
  { prefix: "/api/admin/branch-qr", methods: { GET: any("branch.view", "branch.manage") }, fallback: all("branch.manage") },
  { prefix: "/api/admin/branch-authorizations", methods: { GET: any("employee.view", "employee.manage") }, fallback: all("employee.manage") },
  { prefix: "/api/admin/employees/export", fallback: any("reports.export", "employee.view") },
  { prefix: "/api/admin/employees/import", fallback: all("employee.manage") },
  { prefix: "/api/admin/employees/bulk", fallback: all("employee.manage") },
  { prefix: "/api/admin/employees", methods: { GET: any("employee.view", "employee.manage") }, fallback: all("employee.manage") },
  { prefix: "/api/admin/options/employees", fallback: any("employee.view", "employee.manage", "time_entry.view", "schedule.view", "reports.export") },
  { prefix: "/api/admin/options/branches", fallback: any("branch.view", "branch.manage", "employee.view", "schedule.view", "reports.export") },
  { prefix: "/api/admin/options/roles", fallback: any("employee.view", "employee.manage") },
  { prefix: "/api/admin/options/sectors", fallback: any("employee.view", "employee.manage") },
  { prefix: "/api/admin/work-schedules", methods: { GET: any("schedule.view", "schedule.manage") }, fallback: all("schedule.manage") },
  { prefix: "/api/admin/schedules/validate", fallback: any("schedule.view", "schedule.manage") },
  { prefix: "/api/admin/schedules", methods: { GET: any("schedule.view", "schedule.manage") }, fallback: all("schedule.manage") },
  { prefix: "/api/admin/holidays", methods: { GET: any("schedule.view", "schedule.manage") }, fallback: all("schedule.manage") },
  { prefix: "/api/admin/holiday-decisions", methods: { GET: any("schedule.view", "schedule.manage") }, fallback: all("schedule.manage") },
  { prefix: "/api/admin/shift-requests", methods: { GET: any("schedule.view", "schedule.manage") }, fallback: all("schedule.manage") },
  { prefix: "/api/admin/time-entries", methods: { GET: any("time_entry.view", "time_entry.review") }, fallback: all("time_entry.review") },
  { prefix: "/api/admin/point-reviews", fallback: all("time_entry.review") },
  { prefix: "/api/admin/inconsistencies", methods: { GET: any("inconsistency.view", "inconsistency.review", "time_entry.review") }, fallback: any("inconsistency.review", "time_entry.review") },
  { prefix: "/api/admin/justifications", methods: { GET: any("justification.view", "justification.review", "time_entry.review") }, fallback: any("justification.review", "time_entry.review") },
  { prefix: "/api/admin/geo-report", fallback: any("time_entry.view", "time_entry.review") },
  { prefix: "/api/admin/devices", methods: { GET: any("devices.view", "devices.manage", "time_entry.review") }, fallback: any("devices.manage", "time_entry.review") },
  { prefix: "/api/admin/overtime-reviews", fallback: all("overtime.review") },
  { prefix: "/api/admin/hour-bank", methods: { GET: any("time_bank.view", "time_bank.manage") }, fallback: all("time_bank.manage") },
  { prefix: "/api/admin/payroll/professional", methods: { GET: all("payroll.view") }, fallback: any("payroll.calculate", "payroll.approve", "payroll.close") },
  { prefix: "/api/admin/payroll-items", fallback: any("payroll.view", "payroll.calculate") },
  { prefix: "/api/admin/payroll", methods: { GET: all("payroll.view") }, fallback: any("payroll.calculate", "payroll.approve", "payroll.close") },
  { prefix: "/api/admin/reports/professional", fallback: any("reports.export", "payroll.export") },
  { prefix: "/api/admin/reports", fallback: any("reports.export", "payroll.export") },
  { prefix: "/api/admin/regulatory-exports", fallback: all("reports.export") },
  { prefix: "/api/admin/settings", fallback: all("tenant.manage") },
  { prefix: "/api/admin/onboarding", fallback: all("tenant.manage") },
  { prefix: "/api/admin/tenants", fallback: all("tenant.manage") },
  { prefix: "/api/admin/branding", fallback: all("branding.manage") },
  { prefix: "/api/admin/privacy-requests", fallback: all("audit.view") },
  { prefix: "/api/admin/notifications", fallback: any("tenant.view", "audit.view", "employee.view", "time_entry.view", "payroll.view") },
  { prefix: "/api/admin/dashboard", fallback: any("time_entry.view", "employee.view", "payroll.view", "reports.export", "audit.view") },
];

export function requirementAllows(granted: readonly string[], requirement: PermissionRequirement): boolean {
  const set = new Set(granted);
  if (granted.includes("*")) return true;
  if (requirement.all?.some((permission) => !set.has(permission))) return false;
  if (requirement.any?.length && !requirement.any.some((permission) => set.has(permission))) return false;
  return true;
}

export function adminRouteRequirement(pathname: string, method = "GET"): PermissionRequirement | null {
  const normalizedMethod = method.toUpperCase() as HttpMethod;
  const sortedRules = [...ADMIN_ROUTE_RULES].sort((a, b) => b.prefix.length - a.prefix.length);
  const rule = sortedRules.find((item) => pathname === item.prefix || pathname.startsWith(`${item.prefix}/`));
  if (!rule) return null;
  return rule.methods?.[normalizedMethod] || rule.fallback || null;
}
