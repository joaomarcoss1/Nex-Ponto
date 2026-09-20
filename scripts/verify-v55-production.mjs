import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(path) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const packageJson = JSON.parse(read("package.json"));
const browserSupabase = read("src/lib/client/supabase.ts");
const runtimeRoute = read("src/app/api/public/runtime-config/route.ts");
const adminLogin = read("src/components/admin/AdminLogin.tsx");
const environment = read("src/lib/config/environment.ts");
const readiness = read("src/app/api/readiness/route.ts");
const vercel = read("vercel.json");
const migration058 = read("supabase/migrations/058_nexponto_v555_production_recovery.sql");
const envExample = read(".env.example");

assert(/^5\.5\.(5|6)$/.test(packageJson.version), "package.json deve declarar v5.5.5 ou superior compatível.");
assert(/validate-env\.mjs --build && next build/.test(packageJson.scripts.build), "build deve validar ambiente core antes do next build.");
assert(browserSupabase.includes("/api/public/runtime-config"), "cliente Supabase do browser deve carregar runtime-config.");
assert(browserSupabase.includes("loadBrowserSupabaseConfig"), "cliente Supabase deve expor carregamento assíncrono cacheado.");
assert(!/SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE|RATE_LIMIT_HASH_SALT|AUDIT_HASH_SALT/.test(browserSupabase), "cliente browser não pode referenciar secrets.");
assert(runtimeRoute.includes("requireSupabaseBrowserServerConfig"), "runtime-config deve usar validador público seguro.");
assert(!/supabaseServiceRoleKey|SUPABASE_SERVICE_ROLE_KEY|RATE_LIMIT_HASH_SALT|AUDIT_HASH_SALT/.test(runtimeRoute), "runtime-config não pode retornar ou referenciar secrets.");
assert(adminLogin.includes("Preparando ambiente") && adminLogin.includes("Tentar novamente"), "login deve ter UX de carregamento e retry do runtime config.");
assert(environment.includes("requireAdminLoginConfig") && environment.includes("requireJobsConfig"), "ambiente deve ser separado por capacidade.");
assert(readiness.includes("coreConfiguration") && readiness.includes("browserRuntimeConfig") && readiness.includes("jobsConfiguration"), "readiness deve discriminar componentes.");
assert(!/"schedule"\s*:\s*"\*\s+\*\s+\*\s+\*\s+\*"/.test(vercel), "vercel.json não pode conter cron a cada minuto.");
assert(migration058.includes("text/plain"), "migration 058 deve permitir text/plain no bucket exports.");
assert(migration058.includes("'5.5.5'"), "migration 058 deve registrar schema version 5.5.5.");
assert(envExample.includes("SUPABASE_URL=") && envExample.includes("SUPABASE_ANON_KEY="), ".env.example deve conter variáveis Supabase canônicas.");
assert(envExample.includes("JOB_EXECUTION_MODE=external"), ".env.example deve declarar JOB_EXECUTION_MODE.");

console.log("OK - contratos de produção v5.5.5 validados.");
