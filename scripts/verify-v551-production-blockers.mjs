import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const exists = (file) => fs.existsSync(file);
const migration = exists("supabase/migrations/056_nexponto_v551_production_blockers.sql")
  ? read("supabase/migrations/056_nexponto_v551_production_blockers.sql")
  : "";
const checks = [
  ["migration 056 incremental", Boolean(migration)],
  ["admin RPCs revogadas de anon/authenticated", /revoke all on function public\.create_tenant_admin_v55[\s\S]*from public, anon, authenticated/i.test(migration)],
  ["admin disable preserva permissions", !/disable_tenant_admin_v55[\s\S]*update public\.tenant_memberships[\s\S]*permissions\s*=/i.test(migration)],
  ["admin reactivate preserva permissions", !/reactivate_tenant_admin_v55[\s\S]*update public\.tenant_memberships[\s\S]*permissions\s*=/i.test(migration)],
  ["agregação de banco de horas", migration.includes("hour_bank_summary_v551")],
  ["settings canônicas em tenant_settings", read("src/lib/server/settings.ts").includes('from("tenant_settings")')],
  ["relatórios sem limit 5001", !read("src/app/api/admin/reports/route.ts").includes(".limit(5001)")],
  ["relatórios sem maxRows 5001", !read("src/app/api/admin/reports/route.ts").includes("maxRows: 5001")],
  ["folha profissional paginada", read("src/app/api/admin/payroll/professional/route.ts").includes("fetchPayrollRows")],
  ["worker regulatório paginado", read("src/app/api/internal/jobs/process/route.ts").includes("fetchAllPaginated")],
  ["rate limit bootstrap de dispositivo", read("src/app/api/public/device/route.ts").includes("public-device-bootstrap")],
  ["anexo bloqueado sem scanner", read("src/app/api/public/justifications/route.ts").includes("ATTACHMENT_SCANNER_ENABLED")],
  ["ponto não ignora falha de device", read("src/app/api/public/clock/register/route.ts").includes("deviceUpdateError")],
  ["ponto não ignora falha de risco", read("src/app/api/public/clock/register/route.ts").includes("riskError")],
  ["request id por request", read("src/lib/server/http.ts").includes("WeakMap<Request, string>")],
];

for (const [name, ok] of checks) console.log(`${ok ? "OK" : "FALHA"} ${name}`);
if (checks.some(([, ok]) => !ok)) process.exit(1);
