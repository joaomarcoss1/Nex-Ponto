import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Tables whose rows belong to exactly one tenant. The adapter below is the
 * final safety net for server-side service-role calls: it injects tenant_id in
 * inserts/upserts and an equality filter in reads/updates/deletes.
 *
 * RLS remains mandatory. This adapter exists to prevent accidental unscoped
 * service-role access in legacy routes while those routes are migrated.
 */
export const TENANT_SCOPED_TABLES = new Set([
  "admin_users",
  "branches",
  "employees",
  "employee_salary_history",
  "work_schedules",
  "employee_branch_authorizations",
  "holidays",
  "time_entries",
  "absence_justifications",
  "payroll_periods",
  "payroll_items",
  "overtime_reviews",
  "audit_logs",
  "system_settings",
  "tenant_branding",
  "pin_attempt_logs",
  "branch_operating_hours",
  "shift_templates",
  "shift_template_intervals",
  "holiday_operation_decisions",
  "employee_import_batches",
  "hour_bank_movements",
  "shift_requests",
  "admin_notifications",
  "branch_qr_tokens",
  "payroll_closure_checks",
  "payroll_homologation_checks",
  "branch_geolocation_history",
  "report_export_logs",
  "tenant_onboarding_steps",
  "tenant_member_branches",
  "gps_validation_sessions",
  "authorized_devices",
  "work_sessions",
  "work_session_events",
  "schedule_cycles",
  "schedule_cycle_days",
  "schedule_publications",
  "schedule_occurrences",
  "coverage_requirements",
  "clock_attempts",
  "background_jobs",
  "report_exports",
  "employee_portal_notifications",
  "migration_integrity_snapshots",
  "collective_agreements",
  "payroll_rule_sets",
  "payroll_rule_versions",
  "employee_contract_rules",
  "payroll_legal_tables",
  "payroll_calculation_runs",
  "payroll_rubrics",
  "payroll_item_rubrics",
  "payroll_divergences",
  "payroll_approvals",
  "employee_schedule_cycle_assignments",
  "schedule_validation_issues",
  "legacy_payroll_write_blocks",
  "clock_risk_events",
  "time_clock_receipts",
  "time_entry_adjustments",
  "payroll_state_transitions",
  "background_job_events",
  "privacy_requests",
  "tenant_lifecycle_requests"
]);

type TenantRecord = Record<string, unknown>;
type TenantPayload = TenantRecord | TenantRecord[];

type BuilderLike = {
  select: (...args: unknown[]) => unknown;
  insert: (values: TenantPayload, options?: unknown) => unknown;
  upsert: (values: TenantPayload, options?: unknown) => unknown;
  update: (values: TenantRecord, options?: unknown) => unknown;
  delete: (options?: unknown) => unknown;
};

type Filterable = { eq: (column: string, value: unknown) => unknown };

function withTenantValue(value: TenantRecord, tenantId: string): TenantRecord {
  const supplied = value.tenant_id;
  if (supplied !== undefined && supplied !== null && supplied !== tenantId) {
    throw new Error("Tentativa de gravar dados em uma empresa diferente do contexto ativo.");
  }
  return { ...value, tenant_id: tenantId };
}

function withTenantPayload(values: TenantPayload, tenantId: string): TenantPayload {
  return Array.isArray(values)
    ? values.map((value) => withTenantValue(value, tenantId))
    : withTenantValue(values, tenantId);
}

function applyTenantFilter(result: unknown, tenantId: string): unknown {
  if (!result || typeof result !== "object" || !("eq" in result)) {
    throw new Error("Não foi possível aplicar o isolamento por empresa à consulta.");
  }
  return (result as Filterable).eq("tenant_id", tenantId);
}

/**
 * Wraps a service-role client with mandatory tenant scoping for all business
 * tables. Platform/global tables are left untouched.
 */
export function createTenantScopedClient(client: SupabaseClient, tenantId: string): SupabaseClient {
  if (!tenantId) throw new Error("Contexto de empresa ausente.");

  return new Proxy(client, {
    get(target, property, receiver) {
      if (property !== "from") return Reflect.get(target, property, receiver);

      return (table: string) => {
        const rawBuilder = target.from(table) as unknown as BuilderLike;
        if (!TENANT_SCOPED_TABLES.has(table)) return rawBuilder;

        return new Proxy(rawBuilder, {
          get(builderTarget, builderProperty, builderReceiver) {
            if (builderProperty === "select") {
              return (...args: unknown[]) => applyTenantFilter(builderTarget.select(...args), tenantId);
            }
            if (builderProperty === "insert") {
              return (values: TenantPayload, options?: unknown) =>
                builderTarget.insert(withTenantPayload(values, tenantId), options);
            }
            if (builderProperty === "upsert") {
              return (values: TenantPayload, options?: unknown) =>
                builderTarget.upsert(withTenantPayload(values, tenantId), options);
            }
            if (builderProperty === "update") {
              return (values: TenantRecord, options?: unknown) =>
                applyTenantFilter(builderTarget.update(values, options), tenantId);
            }
            if (builderProperty === "delete") {
              return (options?: unknown) => applyTenantFilter(builderTarget.delete(options), tenantId);
            }
            return Reflect.get(builderTarget, builderProperty, builderReceiver);
          }
        });
      };
    }
  }) as SupabaseClient;
}
