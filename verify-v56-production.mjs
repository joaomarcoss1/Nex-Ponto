import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(path) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const packageJson = JSON.parse(read("package.json"));
const migration059 = read("supabase/migrations/059_nexponto_v556_final_auth_production_hardening.sql");
const adminsRoute = read("src/app/api/admin/admins/route.ts");
const auth = read("src/lib/server/auth.ts");
const environment = read("src/lib/config/environment.ts");
const clockRegister = read("src/app/api/public/clock/register/route.ts");
const jobsRoute = read("src/app/api/internal/jobs/process/route.ts");
const timeEntries = read("src/app/api/admin/time-entries/route.ts");
const geoReport = read("src/app/api/admin/geo-report/route.ts");
const adminShell = read("src/components/admin/AdminShell.tsx");
const css = read("src/app/globals.css");
const sw = read("public/sw.js");
const ci = read(".github/workflows/ci.yml");

assert(packageJson.version === "5.5.6", "package.json deve declarar v5.5.6.");
assert(packageJson.scripts["structure:v56"] === "node scripts/verify-v56-production.mjs", "script structure:v56 deve existir.");
assert(/values\('5\.5\.6'/.test(migration059), "migration 059 deve registrar schema version 5.5.6.");
assert(/upsert_tenant_admin_v556/.test(migration059), "migration 059 deve criar RPC transacional de admin.");
assert(/tenant_memberships[\s\S]*on conflict\(tenant_id,auth_user_id\)/i.test(migration059), "RPC de admin deve sincronizar tenant_memberships.");
assert(/mfa_required\)\s*values[\s\S]*true,false/i.test(migration059), "bootstrap deve criar platform superadmin sem MFA operacional.");
assert(/mfa_required=false/i.test(migration059), "bootstrap/update deve manter MFA operacional desabilitado.");
assert(/claim_background_job_v556/.test(migration059) && /lease_token/.test(migration059), "migration 059 deve criar jobs com lease_token.");
assert(/heartbeat_background_job_v556/.test(migration059) && /complete_background_job_v556/.test(migration059) && /fail_background_job_v556/.test(migration059), "jobs v5.5.6 devem validar heartbeat/conclusão/falha com lease.");

assert(/upsert_tenant_admin_v556/.test(adminsRoute), "API de administradores deve usar RPC transacional v556.");
assert(!/from\("admin_users"\)\.insert|from\("admin_users"\)\.update/.test(adminsRoute), "API de administradores não pode gravar admin_users fora da RPC transacional.");
assert(/rollbackNewAuthUser/.test(adminsRoute), "criação de Auth user deve ter rollback quando a RPC falhar.");
assert(/ADMIN_MEMBERSHIP_ROLE_MISMATCH/.test(auth), "auth deve rejeitar divergência de role entre profile e membership.");
assert(/ADMIN_MEMBERSHIP_BRANCH_MISMATCH/.test(auth), "auth deve rejeitar divergência de filiais entre profile e membership.");
assert(/adminReadRouteRequirement/.test(auth), "auth deve auditar permissões também em GET administrativo.");
assert(!/selectedMembership\.role\s*\|\|\s*profile\.role/.test(auth), "membership deve ser fonte canônica de autorização, sem fallback silencioso para profile.");

assert(/NODE_ENV\s*===\s*"production"/.test(environment), "validador de env deve distinguir produção.");
assert(/production[\s\S]*readEnv\(env, "SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"\)/.test(environment), "produção não pode aceitar TEST_SUPABASE_URL como fallback.");
assert(/production[\s\S]*readEnv\(env, "SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"\)/.test(environment), "produção não pode aceitar TEST_SUPABASE_ANON_KEY como fallback.");

assert(/requireReceiptConfig\(\)/.test(clockRegister), "registro de ponto deve validar recibo antes do commit.");
assert(/clock_receipt_generation_failed_after_commit/.test(clockRegister), "falha pós-commit do recibo deve virar sucesso com alerta, não falso negativo.");
assert(/code\s*===\s*"23505"/.test(clockRegister), "idempotência concorrente deve tratar duplicate key como replay.");

assert(/claim_background_job_v556/.test(jobsRoute), "processador deve reservar jobs com claim v556.");
assert(/p_lease_token/.test(jobsRoute), "processador deve enviar lease_token no heartbeat/completion/failure.");
assert(!/heartbeat_background_job_v553|complete_background_job_v553|claim_background_job_v554|fail_background_job_v554/.test(jobsRoute), "processador não deve chamar rotinas antigas de jobs.");

assert(!/\.limit\(600\)/.test(timeEntries), "time_entries não pode manter teto fixo de 600 registros.");
assert(/pagination/.test(timeEntries) && /\.range\(/.test(timeEntries), "time_entries deve ser paginado.");
assert(!/\.limit\(1500\)/.test(geoReport), "geo-report não pode manter teto fixo de 1500 registros.");
assert(/fetchAllRows/.test(geoReport), "geo-report deve usar paginação/fetchAllRows para exportações completas.");

assert(adminShell.includes("/admin/revisoes-ponto") && adminShell.includes("/admin/banco-de-horas"), "AdminShell deve mapear rotas reais de revisão e banco de horas.");
assert(!/\[pathname,\s*router,\s*validationAttempt\]/.test(adminShell), "AdminShell não deve revalidar shell completo a cada mudança de pathname.");
assert(/role="dialog"/.test(adminShell) && /aria-modal="true"/.test(adminShell), "menu mobile deve ter semântica acessível.");
assert(!/(^|})\s*\.btn-safe\s*\{[^}]*(^|[;{]\s*)width:\s*100%/im.test(css), "CSS não pode aplicar width:100% global em .btn-safe no mobile.");
assert(/nexponto-v5\.5\.6-static/.test(sw), "service worker deve usar cache v5.5.6.");
assert(/NexPonto v5\.5\.6 quality gate/.test(ci) && /structure:v56/.test(ci), "CI deve validar gate v5.5.6.");
assert(/https:\/\/ci\.nexponto\.example/.test(ci), "CI deve usar APP_URL HTTPS.");

console.log("OK - contratos de produção v5.5.6 validados.");
