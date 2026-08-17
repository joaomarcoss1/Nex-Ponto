import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const requiredFiles = [
  "package.json",
  "next.config.ts",
  "tsconfig.json",
  ".env.example",
  "src/app/page.tsx",
  "src/app/admin/login/page.tsx",
  "src/app/admin/configuracao-inicial/page.tsx",
  "src/app/admin/funcionarios/page.tsx",
  "src/app/admin/administradores/page.tsx",
  "src/app/platform/page.tsx",
  "src/app/api/admin/bootstrap-master/route.ts",
  "src/app/api/platform/tenants/route.ts",
  "src/app/api/admin/admins/route.ts",
  "src/app/api/admin/employees/route.ts",
  "src/app/api/public/clock/register/route.ts",
  "src/lib/server/http.ts",
  "src/lib/server/pagination.ts",
  "src/lib/client/api-error.ts",
  "src/lib/security/admin-route-permissions.ts",
  "supabase/migrations/055_nexponto_v55_admin_rbac_operations.sql",
  "supabase/migrations/056_nexponto_v551_production_blockers.sql",
  "scripts/validate-env.mjs",
  "scripts/verify-migrations.mjs",
  "scripts/audit-database-structure.mjs",
];

const requiredScripts = [
  "dev",
  "build",
  "start",
  "lint",
  "typecheck",
  "test",
  "test:e2e",
  "verify",
  "verify:production",
  "env:check",
  "audit:database",
  "doctor",
  "structure:v55",
  "structure:v551",
];

const requiredEnv = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TENANT_CONTEXT_SECRET",
  "EMPLOYEE_SESSION_SECRET",
  "AUDIT_HASH_SALT",
  "RATE_LIMIT_HASH_SALT",
  "INTERNAL_JOBS_SECRET",
  "DEVICE_IDENTITY_SECRET",
  "RECEIPT_TOKEN_SECRET",
  "APP_URL",
  "NEXT_PUBLIC_APP_URL",
  "MASTER_ADMIN_EMAIL",
  "MASTER_SETUP_TOKEN",
];

const flowMarkers = [
  ["bootstrap_tenant_owner_v4", "src/app/api/admin/bootstrap-master/route.ts"],
  ["create_tenant_with_owner_v4", "src/app/api/platform/tenants/route.ts"],
  ["administrators.manage", "src/app/api/admin/admins/route.ts"],
  ["upsert_employee_v4", "src/app/api/admin/employees/route.ts"],
  ["hashPin", "src/app/api/admin/employees/route.ts"],
  ["requestId", "src/lib/server/http.ts"],
  ["sanitizePublicErrorMessage", "src/lib/server/http.ts"],
  ["apiErrorFromPayload", "src/lib/client/api-error.ts"],
  ["adminRouteRequirement", "src/lib/security/admin-route-permissions.ts"],
  ["fetchAllPaginated", "src/lib/server/pagination.ts"],
  ["create_tenant_admin_v55", "supabase/migrations/055_nexponto_v55_admin_rbac_operations.sql"],
  ["cleanup_operational_data_v55", "supabase/migrations/055_nexponto_v55_admin_rbac_operations.sql"],
];

const failures = [];
const warnings = [];

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

for (const file of requiredFiles) {
  if (!exists(file)) failures.push(`arquivo obrigatório ausente: ${file}`);
}

const packageJson = JSON.parse(read("package.json"));
for (const script of requiredScripts) {
  if (!packageJson.scripts?.[script]) failures.push(`script ausente no package.json: ${script}`);
}

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor !== 22) warnings.push(`Node atual ${process.versions.node}; recomendado Node 22 LTS para paridade com o pacote.`);

const migrationsDir = path.join(root, "supabase", "migrations");
const migrations = fs.existsSync(migrationsDir)
  ? fs.readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort()
  : [];
if (migrations.length < 55) failures.push(`migrations insuficientes: encontradas ${migrations.length}, esperado 55 ou mais`);
if (!migrations.some((name) => name.startsWith("053"))) failures.push("migration incremental 053 ausente");
if (!migrations.some((name) => name.startsWith("054"))) failures.push("migration incremental 054 ausente");
if (!migrations.some((name) => name.startsWith("055"))) failures.push("migration incremental 055 ausente");
if (!migrations.some((name) => name.startsWith("056"))) failures.push("migration incremental 056 ausente");

for (const [marker, file] of flowMarkers) {
  if (exists(file) && !read(file).includes(marker)) failures.push(`marcador crítico ausente em ${file}: ${marker}`);
}

const envExample = read(".env.example");
for (const name of requiredEnv) {
  if (!new RegExp(`^${name}=`, "m").test(envExample)) failures.push(`variável ausente no .env.example: ${name}`);
}

const envLocalPath = path.join(root, ".env.local");
if (!fs.existsSync(envLocalPath)) {
  warnings.push("'.env.local' não existe. Copie .env.example para .env.local e preencha valores reais antes de rodar com banco.");
} else {
  const envLocal = fs.readFileSync(envLocalPath, "utf8");
  for (const name of requiredEnv) {
    const match = envLocal.match(new RegExp(`^${name}=(.*)$`, "m"));
    if (!match || !match[1]?.trim()) warnings.push(`.env.local sem valor para ${name}`);
  }
}

if (failures.length) {
  console.error("BLOQUEADOR — pacote incompleto para VSCode/produção:\n- " + failures.join("\n- "));
  if (warnings.length) console.error("\nAvisos:\n- " + warnings.join("\n- "));
  process.exit(1);
}

console.log("OK — estrutura crítica, fluxos principais e pacote VSCode verificados.");
if (warnings.length) console.log("Avisos:\n- " + warnings.join("\n- "));
