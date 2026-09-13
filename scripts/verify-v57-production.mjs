import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(path) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const packageJson = JSON.parse(read("package.json"));
const migration = read("supabase/migrations/060_nexponto_v557_final_production_validation.sql");
const adminsRoute = read("src/app/api/admin/admins/route.ts");
const adminShell = read("src/components/admin/AdminShell.tsx");
const platform = read("src/app/platform/page.tsx");
const jobs = read("src/app/api/internal/jobs/process/route.ts");
const readiness = read("src/app/api/readiness/route.ts");
const environment = read("src/lib/config/environment.ts");
const vercel = read("vercel.json");
const ci = read(".github/workflows/ci.yml");

assert(["5.5.7", "5.5.8"].includes(packageJson.version), "package.json deve declarar v5.5.7 ou release compatível posterior.");
assert(packageJson.scripts["structure:v57"] === "node scripts/verify-v57-production.mjs", "structure:v57 deve existir.");
assert(/count_effective_master_admins_v557/.test(migration), "migration 060 deve proteger o último Master efetivo.");
assert(/is_effective_admin_actor_v557/.test(migration), "RPC administrativa deve validar ator/tenant.");
assert(/rollback_tenant_admin_creation_v557/.test(migration) && /restore_tenant_admin_snapshot_v557/.test(migration), "migration 060 deve oferecer compensação de sincronização.");
assert(/RECONCILIATION_AMBIGUOUS/.test(migration), "reconciliação ambígua não pode promover automaticamente.");
assert(/alter function %s set search_path/i.test(migration), "SECURITY DEFINER deve receber search_path explícito.");
assert(/values\('5\.5\.7'/.test(migration), "migration 060 deve registrar schema 5.5.7.");

assert(/upsert_tenant_admin_v557/.test(adminsRoute), "API de admins deve usar RPC v557.");
assert(/ADMIN_SYNC_PARTIAL_FAILURE/.test(adminsRoute), "falha parcial Auth/DB deve ser explícita.");
assert(/synchronizeExistingAuthUser/.test(adminsRoute) && /compensateAdminDatabase/.test(adminsRoute), "atualização Auth deve ter compensação de banco.");
assert(/tenant_owner/.test(adminsRoute) && /count_effective_master_admins_v557/.test(adminsRoute), "tenant owner e último Master devem ser preservados.");

assert(/onAuthStateChange/.test(adminShell) && /TOKEN_REFRESHED/.test(adminShell), "shell deve reagir aos eventos de Auth.");
assert(/querySelectorAll<HTMLElement>/.test(adminShell) && /event\.shiftKey/.test(adminShell), "drawer móvel deve prender o foco.");
assert(/moreReturnFocusRef/.test(adminShell), "drawer móvel deve restaurar o foco.");
assert(/authState !== "ready"/.test(platform) && /\/platform\/login/.test(platform), "plataforma não pode renderizar antes de validar a sessão.");

assert(/setInterval/.test(jobs) && /startLeaseHeartbeat/.test(jobs), "job longo deve renovar heartbeat periodicamente.");
assert(/\/api\/internal\/jobs\/process/.test(vercel), "executor real de jobs deve estar agendado.");
assert(/"5\.5\.[78]"/.test(readiness) && /count_effective_master_admins_v557/.test(readiness), "readiness deve exigir migration/RPCs 5.5.7 ou posterior.");
assert(/serviceRole/.test(readiness) && /defaultTimezone/.test(readiness), "readiness deve expor checks de service role e timezone.");
assert(/invalid_timezone/.test(environment), "ambiente deve rejeitar timezone inválido.");

assert(/nexponto-v5\.5\.[78]-static/.test(read("public/sw.js")), "cache PWA deve usar v5.5.7 ou posterior.");
assert(/NexPonto v5\.5\.[78] quality gate/.test(ci) && /structure:v57/.test(ci), "CI deve executar o gate v5.5.7.");
assert(read("scripts/sql/precheck-v557.sql").includes("master_chain_present"), "precheck v557 deve validar cadeia Master.");
assert(read("scripts/sql/postcheck-v557.sql").includes("security_definer_search_path"), "postcheck v557 deve validar SECURITY DEFINER.");

console.log("OK - contratos de produção v5.5.7 validados.");
