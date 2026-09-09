import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const requiredFiles = [
  "supabase/migrations/031_nexponto_v51_hour_bank_sign_normalization.sql",
  "supabase/migrations/032_nexponto_v51_historical_journey_snapshots.sql",
  "supabase/migrations/033_nexponto_v51_contract_legal_rule_versioning.sql",
  "supabase/migrations/034_nexponto_v51_professional_payroll_core.sql",
  "supabase/migrations/035_nexponto_v51_financial_rls_hardening.sql",
  "supabase/migrations/036_nexponto_v51_schedule_cycles_coverage.sql",
  "supabase/migrations/037_nexponto_v51_reports_jobs_legacy_guard.sql",
  "supabase/migrations/038_nexponto_v51_integrity_precheck_postcheck.sql",
  "supabase/migrations/039_nexponto_v51_payroll_result_transactions.sql",
  "supabase/migrations/040_nexponto_v51_overtime_approval_destination.sql",
  "supabase/migrations/041_nexponto_v51_schedule_transactional_publish.sql",
  "supabase/migrations/042_nexponto_v51_new_tables_rls_and_integrity.sql",
  "supabase/migrations/043_nexponto_v51_session_snapshot_attendance_hardening.sql",
  "supabase/migrations/044_nexponto_v51_divergence_resolution_and_approval_segregation.sql",
  "src/lib/services/hour-bank-v51.ts",
  "src/lib/services/historical-journey-v51.ts",
  "src/lib/services/session-attendance-v51.ts",
  "src/lib/services/schedule-v51.ts",
  "src/lib/services/professional-payroll-v51.ts",
  "src/app/api/admin/payroll/professional/route.ts",
  "src/components/admin/ProfessionalPayrollPageV51.tsx",
  "src/app/admin/escalas-profissionais/page.tsx",
];
const missing = requiredFiles.filter((file) => !fs.existsSync(path.join(root, file)));
if (missing.length) {
  console.error("Arquivos obrigatórios ausentes:\n" + missing.join("\n"));
  process.exit(1);
}
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const checks = [
  ["banco de horas positivo", read(requiredFiles[0]).includes("minutes>0") || read(requiredFiles[0]).includes("minutes > 0")],
  ["snapshot histórico", read(requiredFiles[1]).includes("schedule_snapshot_checksum")],
  ["tabelas legais versionadas", read(requiredFiles[2]).includes("payroll_legal_tables")],
  ["RLS sem FOR ALL de leitura", !/create policy[\s\S]{0,300}for all[\s\S]{0,300}can_view_financial_v51/i.test(read(requiredFiles[4]))],
  ["ciclos profissionais", read(requiredFiles[5]).includes("12x36") && read(requiredFiles[5]).includes("COVERAGE_DEFICIT")],
  ["legado protegido", read(requiredFiles[6]).includes("legacy_payroll_write_blocks")],
  ["resultado transacional", read(requiredFiles[8]).includes("replace_payroll_run_results_v51")],
  ["aprovação de extra", read(requiredFiles[9]).includes("approve_overtime_v51")],
  ["publicação transacional", read(requiredFiles[10]).includes("save_schedule_publication_v51")],
  ["API legada somente leitura", read("src/app/api/admin/payroll/route.ts").includes("LEGACY_PAYROLL_READ_ONLY")],
  ["snapshot normalizado", read("supabase/migrations/043_nexponto_v51_session_snapshot_attendance_hardening.sql").includes("normalize_work_session_snapshot_v51")],
  ["marcações por sessão", read("src/app/api/admin/payroll/professional/route.ts").includes("work_session_id") && read("src/app/api/admin/payroll/professional/route.ts").includes("calculateSessionAttendanceV51")],
  ["divergências auditáveis", read("supabase/migrations/044_nexponto_v51_divergence_resolution_and_approval_segregation.sql").includes("resolve_payroll_divergence_v51")],
  ["mobile premium de folha", read("src/components/admin/ProfessionalPayrollPageV51.tsx").includes("MobileCardList")],
];
const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? "✔" : "✖"} ${name}`);
if (failed.length) process.exit(1);
console.log(`NexPonto v5.1: ${checks.length} verificações estruturais aprovadas.`);
