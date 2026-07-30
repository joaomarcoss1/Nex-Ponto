import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

function read(path) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function verifyPolicies(sql, filename) {
  const policies = [...sql.matchAll(/create\s+policy\s+"([^"]+)"/gi)].map((match) => match[1]);
  const hasVersionSweep = /from\s+pg_policies[\s\S]*policyname\s+like\s+'v017 %'[\s\S]*drop policy if exists/gi.test(sql);
  for (const policy of policies) {
    if (policy.startsWith("v017 ") && hasVersionSweep) continue;
    const escaped = policy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert(
      new RegExp(`drop\\s+policy\\s+if\\s+exists\\s+"${escaped}"`, "i").test(sql),
      `${filename}: policy ${policy} não possui DROP POLICY IF EXISTS.`,
    );
  }
}

const migrationDirectory = "supabase/migrations";
const filenames = readdirSync(resolve(process.cwd(), migrationDirectory))
  .filter((name) => name.endsWith(".sql"))
  .sort();
const prefixes = filenames.map((name) => Number(name.slice(0, 3)));
assert(prefixes.every((value, index) => value === index + 1), "As migrations devem ser sequenciais, sem lacunas ou duplicidades.");

const securityPath = `${migrationDirectory}/016_v017_seguranca_final_homologacao_producao.sql`;
const holidayPath = `${migrationDirectory}/018_v019_holiday_operations_payroll_hardening.sql`;
const platformPath = `${migrationDirectory}/019_nexponto_professional_platform.sql`;
const multiTenantPath = `${migrationDirectory}/020_nexponto_v3_multitenant_foundation.sql`;
const v4SecurityPath = `${migrationDirectory}/021_nexponto_v4_tenancy_security_and_operations.sql`;
const v4ClockPath = `${migrationDirectory}/022_nexponto_v4_clock_transactions.sql`;
const v4OperationsPath = `${migrationDirectory}/023_nexponto_v4_operational_transactions.sql`;
const v4PortalPath = `${migrationDirectory}/024_nexponto_v4_employee_portal_and_requests.sql`;
const v4PlannerPath = `${migrationDirectory}/025_nexponto_v4_schedule_planner.sql`;
const v4EmployeePath = `${migrationDirectory}/026_nexponto_v4_employee_atomic_upsert.sql`;
const v4ManualEntryPath = `${migrationDirectory}/027_nexponto_v4_manual_time_entry_and_multi_breaks.sql`;
const v4BootstrapPath = `${migrationDirectory}/028_nexponto_v4_bootstrap_tenant_owner.sql`;
const v4OfflineGuardPath = `${migrationDirectory}/029_nexponto_v4_offline_feature_guard.sql`;
const v4PlatformTenantPath = `${migrationDirectory}/030_nexponto_v4_platform_tenant_atomic_create.sql`;
const security = read(securityPath);
const holiday = read(holidayPath);
const platform = read(platformPath);
const multiTenant = read(multiTenantPath);
const v4Security = read(v4SecurityPath);
const v4Clock = read(v4ClockPath);
const v4Operations = read(v4OperationsPath);
const v4Portal = read(v4PortalPath);
const v4Planner = read(v4PlannerPath);
const v4Employee = read(v4EmployeePath);
const v4ManualEntry = read(v4ManualEntryPath);
const v4Bootstrap = read(v4BootstrapPath);
const v4OfflineGuard = read(v4OfflineGuardPath);
const v4PlatformTenant = read(v4PlatformTenantPath);

verifyPolicies(security, securityPath);
verifyPolicies(holiday, holidayPath);
verifyPolicies(platform, platformPath);
verifyPolicies(multiTenant, multiTenantPath);

assert(/create\s+table\s+if\s+not\s+exists\s+public\.holiday_operation_decisions/i.test(holiday), "A migration 018 deve criar decisões de feriado.");
assert(/add\s+column\s+if\s+not\s+exists\s+termination_date/i.test(holiday), "A migration 018 deve adicionar termination_date de modo idempotente.");
assert(/create\s+unique\s+index\s+if\s+not\s+exists\s+uq_holiday_operation_decision_scope/i.test(holiday), "A migration 018 deve possuir índice único idempotente.");
assert(/adjust_time_entry_transactional/i.test(platform), "A migration 019 deve criar ajuste transacional de ponto.");
assert(/replacement\.idempotency_key\s*:=\s*null/i.test(platform), "O ajuste de ponto não pode copiar a chave idempotente.");
assert(/replace_payroll_items_transactional/i.test(platform), "A migration 019 deve substituir a memória da folha em transação.");
assert(/review_shift_request_transactional/i.test(platform), "A migration 019 deve aplicar aprovações em transação.");
assert(/create\s+table\s+if\s+not\s+exists\s+public\.branch_operating_hours/i.test(platform), "A migration 019 deve criar horários de funcionamento.");
assert(!/\bpin_hash\b|\bpin_code\b|add\s+column\s+if\s+not\s+exists\s+pin\b/i.test(holiday), "A migration 018 não pode alterar PIN.");
assert(/create\s+table\s+if\s+not\s+exists\s+public\.tenants/i.test(multiTenant), "A migration 020 deve criar tenants.");
assert(/create\s+table\s+if\s+not\s+exists\s+public\.tenant_memberships/i.test(multiTenant), "A migration 020 deve criar memberships.");
assert(/current_tenant_id/i.test(multiTenant), "A migration 020 deve resolver tenant no banco.");
assert(/tenant_isolation/i.test(multiTenant), "A migration 020 deve criar isolamento RLS.");
assert(/tenant_member_branches/i.test(v4Security), "A migration 021 deve criar escopo de filiais por membership.");
assert(/consume_rate_limit/i.test(v4Security), "A migration 021 deve criar rate limit distribuído.");
assert(/register_time_entry_v4/i.test(v4Clock), "A migration 022 deve registrar ponto transacionalmente.");
assert(/append_hour_bank_movement_v4/i.test(v4Operations) && /reverse_hour_bank_movement_v4/i.test(v4Operations), "A migration 023 deve criar ledger e estorno do banco de horas.");
assert(/validate_branch_gps_session_v4/i.test(v4Operations), "A migration 023 deve validar GPS presencialmente.");
assert(/submit_employee_request_v4/i.test(v4Portal), "A migration 024 deve criar solicitações do portal do funcionário.");
assert(/save_schedule_publication_v4/i.test(v4Planner) && /upsert_shift_template_v4/i.test(v4Planner), "A migration 025 deve criar planejador e modelos transacionais.");
assert(/upsert_employee_v4/i.test(v4Employee), "A migration 026 deve criar cadastro de funcionário atômico.");
assert(/create_manual_time_entry_v4/i.test(v4ManualEntry), "A migration 027 deve criar marcação manual transacional.");
assert(/drop index if exists public\.idx_unique_time_entry_action_per_day/i.test(v4ManualEntry), "A migration 027 deve remover a restrição incompatível com múltiplos intervalos.");
assert(/bootstrap_tenant_owner_v4/i.test(v4Bootstrap), "A migration 028 deve criar bootstrap atômico de tenant e proprietário.");
assert(/offline_clock/i.test(v4OfflineGuard) && /enabled\s*=\s*false/i.test(v4OfflineGuard), "A migration 029 deve manter o ponto offline desabilitado até homologação.");
assert(/create_tenant_with_owner_v4/i.test(v4PlatformTenant), "A migration 030 deve criar empresa e proprietário de forma atômica.");

console.log(`${filenames.length} migrations verificadas: sequência, idempotência e funções críticas presentes.`);
