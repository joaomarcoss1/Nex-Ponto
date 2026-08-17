import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const requiredFiles = [
  "supabase/migrations/049_nexponto_v53_support_devices_and_risk.sql",
  "supabase/migrations/050_nexponto_v53_payroll_segregation.sql",
  "supabase/migrations/051_nexponto_v53_time_clock_evidence.sql",
  "supabase/migrations/052_nexponto_v53_jobs_privacy_and_saas.sql",
  "src/lib/security/authorization.ts",
  "src/lib/security/payroll-actions.ts",
  "src/lib/security/support-scopes.ts",
  "src/lib/security/device-identity.ts",
  "src/lib/security/antifraud.ts",
  "src/lib/contracts/application-errors.ts",
  "src/app/api/public/clock/receipt/route.ts",
  "src/app/api/internal/jobs/process/route.ts",
  "src/app/admin/seguranca-mfa/page.tsx",
  "src/app/admin/seguranca/page.tsx",
  "docs/initial-production-assessment.md",
];
const missing = requiredFiles.filter((file) => !fs.existsSync(path.join(root, file)));
if (missing.length) {
  console.error(`Arquivos v5.3 ausentes:\n${missing.join("\n")}`);
  process.exit(1);
}
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const checks = [
  ["folha oficial desativada", read("src/lib/security/payroll-actions.ts").includes("FEATURE_OFFICIAL_PAYROLL")],
  ["segregação no banco", read(requiredFiles[1]).includes("SEGREGATION_CREATOR_CANNOT_HR_APPROVE")],
  ["NSR atômico", read(requiredFiles[2]).includes("tenant_nsr_counters")],
  ["comprovante por trigger", read(requiredFiles[2]).includes("trg_time_clock_receipt_v53")],
  ["fila com SKIP LOCKED", read(requiredFiles[3]).includes("skip locked")],
  ["dispositivo sem wildcard", !read("src/lib/security/support-scopes.ts").includes('"*"')],
  ["CSP sem unsafe-inline para script", !read("src/middleware.ts").includes("script-src 'self' 'unsafe-inline'")],
  ["tema institucional azul", !read("src/components/admin/AdminShell.tsx").includes("#f7faf7")],
];
const failed = checks.filter(([, result]) => !result);
for (const [name, result] of checks) console.log(`${result ? "OK" : "FALHA"} ${name}`);
if (failed.length) process.exit(1);
console.log(`NexPonto v5.3: ${checks.length} controles estruturais aprovados.`);
