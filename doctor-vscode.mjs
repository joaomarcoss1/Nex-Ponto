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
  "src/app/api/auth/admin-login/route.ts",
  "src/app/api/public/runtime-config/route.ts",
  "src/app/api/public/clock/register/route.ts",
  "src/lib/server/http.ts",
  "src/lib/client/api-error.ts",
  "scripts/validate-env.mjs",
  "scripts/verify-migrations.mjs",
  "scripts/audit-database-structure.mjs",
  "scripts/sql/precheck-v552.sql",
  "scripts/sql/postcheck-v552.sql",
  "supabase/migrations/055_nexponto_v552_production_auth_stability.sql",
  "supabase/migrations/056_nexponto_v553_production_hardening.sql",
  "supabase/migrations/057_nexponto_v554_final_production_hardening.sql",
  "supabase/migrations/058_nexponto_v555_production_recovery.sql",
  "supabase/migrations/059_nexponto_v556_final_auth_production_hardening.sql",
  "scripts/sql/precheck-v554.sql",
  "scripts/sql/postcheck-v554.sql",
  "scripts/sql/precheck-v555.sql",
  "scripts/sql/postcheck-v555.sql",
  "scripts/sql/precheck-master-v56.sql",
  "docs/production/BACKUP_RESTORE.md",
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
];

const requiredEnv = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
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
  "JOB_EXECUTION_MODE",
  "MASTER_ADMIN_EMAIL",
  "MASTER_SETUP_TOKEN",
];

const flowMarkers = [
  ["bootstrap_tenant_owner_v4", "src/app/api/admin/bootstrap-master/route.ts"],
  ["create_tenant_with_owner_v4", "src/app/api/platform/tenants/route.ts"],
  ["administrators.manage", "src/app/api/admin/admins/route.ts"],
  ["upsert_employee_v552", "src/app/api/admin/employees/route.ts"],
  ["consumeRateLimit", "src/app/api/auth/admin-login/route.ts"],
  ["hashPin", "src/app/api/admin/employees/route.ts"],
  ["requestId", "src/lib/server/http.ts"],
  ["sanitizePublicErrorMessage", "src/lib/server/http.ts"],
  ["apiErrorFromPayload", "src/lib/client/api-error.ts"],
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
if (!migrations.some((name) => name.startsWith("056"))) failures.push("migration de hardening v5.5.3 ausente");
if (!migrations.some((name) => name.startsWith("057"))) failures.push("migration de hardening v5.5.4 ausente");
if (!migrations.some((name) => name.startsWith("058"))) failures.push("migration de recuperação v5.5.5 ausente");
if (!migrations.some((name) => name.startsWith("059"))) failures.push("migration de hardening final v5.5.6 ausente");

const operationalAuthFiles = [
  "src/components/admin/AdminLogin.tsx",
  "src/components/admin/AdminShell.tsx",
  "src/lib/server/auth.ts",
  "src/app/api/platform/support-sessions/route.ts",
];
for (const file of operationalAuthFiles) {
  const source = read(file);
  if (/auth\.mfa|MFA_REQUIRED|aal2|totp/i.test(source)) failures.push(`segundo fator ainda interfere no fluxo operacional: ${file}`);
}

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
if (fs.existsSync(envLocalPath) && typeof process.loadEnvFile === "function") {
  process.loadEnvFile(envLocalPath);
}

const liveRequired = ["SUPABASE_SERVICE_ROLE_KEY", "MASTER_ADMIN_EMAIL"];
const liveConfigured = liveRequired.every((name) => Boolean(process.env[name]?.trim()))
  && Boolean((process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)?.trim());
if (liveConfigured) {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const masterEmail = process.env.MASTER_ADMIN_EMAIL.trim().toLowerCase();
    const [authResult, adminResult, versionResult, storageResult, structureResult] = await Promise.all([
      supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      supabase.from("admin_users").select("id,auth_user_id,tenant_id,active").ilike("email", masterEmail),
      supabase.from("nexponto_schema_versions").select("version").eq("version", "5.5.6").maybeSingle(),
      supabase.storage.listBuckets(),
      supabase.rpc("audit_database_structure_v54"),
    ]);
    if (authResult.error) failures.push("Supabase Auth/service_role não respondeu ao doctor");
    const authUser = authResult.data?.users?.find((user) => user.email?.toLowerCase() === masterEmail);
    if (!authUser) failures.push("MASTER_ADMIN_EMAIL não foi encontrado em auth.users");
    const admin = adminResult.data?.find((row) => row.auth_user_id === authUser?.id && row.active);
    if (adminResult.error || !admin) failures.push("master ativo e coerente não foi encontrado em admin_users");
    if (admin) {
      const { data: membership, error } = await supabase.from("tenant_memberships")
        .select("id,active,tenant_id,tenants!inner(status)")
        .eq("auth_user_id", authUser.id).eq("admin_user_id", admin.id).eq("tenant_id", admin.tenant_id).eq("active", true)
        .maybeSingle();
      if (error || !membership || !["trial", "active"].includes(membership.tenants?.status)) {
        failures.push("cadeia master -> membership -> tenant ativo está inconsistente");
      }
    }
    if (versionResult.error || !versionResult.data) failures.push("migration v5.5.6 não aplicada no banco");
    const buckets = new Set((storageResult.data || []).map((bucket) => bucket.id));
    if (storageResult.error || !buckets.has("exports") || !buckets.has("payroll-exports")) failures.push("buckets críticos de exportação ausentes");
    const functions = new Set(structureResult.data?.functions || []);
    for (const name of ["has_tenant_permission", "has_tenant_permission_v54", "reconcile_admin_memberships_v55", "upsert_employee_v552", "register_time_entry_v4", "bulk_set_employee_pins_v554", "upsert_tenant_admin_v556", "claim_background_job_v556", "heartbeat_background_job_v556", "complete_background_job_v556", "fail_background_job_v556"]) {
      if (!functions.has(name)) failures.push(`RPC crítica ausente: ${name}`);
    }
  } catch {
    failures.push("não foi possível concluir os checks online do doctor");
  }
} else {
  warnings.push("checks online de Supabase/master/storage não executados: ambiente real não configurado neste workspace.");
}

if (failures.length) {
  console.error("BLOQUEADOR — pacote incompleto para VSCode/produção:\n- " + failures.join("\n- "));
  if (warnings.length) console.error("\nAvisos:\n- " + warnings.join("\n- "));
  process.exit(1);
}

console.log("OK — estrutura crítica, fluxos principais e pacote VSCode verificados.");
if (warnings.length) console.log("Avisos:\n- " + warnings.join("\n- "));
