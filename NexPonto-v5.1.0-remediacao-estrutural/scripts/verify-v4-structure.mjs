import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(path) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function includes(path, pattern, message) {
  const content = read(path);
  assert(pattern.test(content), `${path}: ${message}`);
}

const requiredFiles = [
  "src/lib/server/tenant-context.ts",
  "src/lib/server/tenant-scoped-client.ts",
  "src/lib/server/public-tenant.ts",
  "src/lib/server/rate-limit.ts",
  "src/lib/server/employee-session.ts",
  "src/app/platform/page.tsx",
  "src/app/admin/onboarding/page.tsx",
  "src/app/admin/selecionar-empresa/page.tsx",
  "src/app/admin/modelos-turno/page.tsx",
  "src/app/admin/planejamento-escalas/page.tsx",
  "src/app/inicio/page.tsx",
  "src/app/escala/page.tsx",
  "src/app/solicitacoes/page.tsx",
  "src/app/perfil/page.tsx",
  "supabase/migrations/028_nexponto_v4_bootstrap_tenant_owner.sql",
  "supabase/migrations/030_nexponto_v4_platform_tenant_atomic_create.sql"
];
for (const path of requiredFiles) assert(existsSync(resolve(process.cwd(), path)), `Arquivo obrigatório ausente: ${path}`);

const publicRoutes = [
  "branches", "branding", "employees", "history", "justifications", "qr",
  "clock/register", "clock/state", "gps/diagnostic", "gps/validate", "manifest",
  "portal", "portal/notifications", "portal/requests"
];
for (const route of publicRoutes) {
  const path = `src/app/api/public/${route}/route.ts`;
  includes(path, /requirePublicTenant|resolvePublicTenant/, "rota pública deve resolver o tenant com contexto confiável");
}

includes("src/app/api/admin/bootstrap-master/route.ts", /bootstrap_tenant_owner_v4/, "bootstrap deve usar a RPC atômica v4");
includes("src/app/api/platform/tenants/route.ts", /create_tenant_with_owner_v4/, "criação de tenant da plataforma deve usar RPC atômica");
includes("src/app/api/admin/time-entries/route.ts", /create_manual_time_entry_v4/, "marcação manual deve usar RPC transacional");
includes("src/app/api/public/clock/register/route.ts", /register_time_entry_v4/, "ponto público deve usar RPC transacional");
includes("src/app/api/admin/hour-bank/route.ts", /append_hour_bank_movement_v4|reverse_hour_bank_movement_v4|append_hour_bank_movement_v51|reverse_hour_bank_movement_v51/, "banco de horas deve usar ledger/estorno");
includes("src/app/api/internal/jobs/holidays/route.ts", /INTERNAL_JOBS_SECRET/, "job interno deve exigir segredo dedicado");

const serviceWorker = read("public/sw.js");
assert(!new RegExp(["bri", "lho"].join(""), "i").test(serviceWorker), "Service worker contém marca anterior.");
assert(/nexponto-v(4|5\.1)/i.test(serviceWorker), "Service worker deve usar cache versionado do NexPonto.");

const packageJson = JSON.parse(read("package.json"));
assert(["4.0.0", "5.1.0"].includes(packageJson.version), "package.json deve declarar uma versão NexPonto homologável.");
assert(existsSync(resolve(process.cwd(), "pnpm-lock.yaml")), "pnpm-lock.yaml ausente.");
// O NexPonto utiliza pnpm-lock.yaml como lockfile oficial.

console.log("Estrutura-base NexPonto verificada: tenancy, portal mobile, operações críticas e pacote limpo presentes.");
