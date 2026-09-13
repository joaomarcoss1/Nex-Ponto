import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

function read(path) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const packageJson = JSON.parse(read("package.json"));
const migration = read("supabase/migrations/061_nexponto_v558_auth_acl_hardening.sql");
const passwordRoute = read("src/app/api/auth/admin-password-change/route.ts");
const passwordUi = read("src/components/admin/AdminNewPassword.tsx");
const loginRoute = read("src/app/api/auth/admin-login/route.ts");
const adminShell = read("src/components/admin/AdminShell.tsx");
const adminsRoute = read("src/app/api/admin/admins/route.ts");
const tenantRoute = read("src/app/api/platform/tenants/route.ts");
const serverAuth = read("src/lib/server/auth.ts");
const vercel = JSON.parse(read("vercel.json"));
const sources = readdirSync(resolve(process.cwd(), "src"), { recursive: true })
  .filter((name) => typeof name === "string" && /\.(ts|tsx)$/.test(name))
  .map((name) => read(`src/${name}`))
  .join("\n");

assert(packageJson.version === "5.5.8", "package.json deve declarar v5.5.8.");
assert(packageJson.dependencies.next === "15.5.25", "Next.js deve incluir o patch de segurança 15.5.25.");
assert(packageJson.dependencies.sharp === "0.35.4", "Sharp deve incluir o patch de segurança 0.35.4.");
assert(packageJson.scripts["structure:v58"] === "node scripts/verify-v58-production.mjs", "structure:v58 deve existir.");
assert(/revoke execute on function %s from public, anon/i.test(migration), "SECURITY DEFINER deve revogar EXECUTE herdado.");
assert(/alter default privileges[\s\S]*revoke execute on functions from public/i.test(migration), "Privilégios padrão de funções devem estar fechados.");
assert(/revoke create on schema public from public, anon, authenticated/i.test(migration), "CREATE no schema public deve estar fechado.");
assert(/grant execute on function public\.has_tenant_permission\(uuid,text\) to authenticated, service_role/i.test(migration), "Helper RLS canônico deve permanecer na allowlist.");
assert(/update auth\.users[\s\S]*raw_app_meta_data[\s\S]*must_change_password/i.test(migration), "Flag legada deve ser migrada para metadata protegida.");
assert(/values\([\s\S]*'5\.5\.8'/i.test(migration), "migration 061 deve registrar schema 5.5.8.");

assert(/authenticatedUser\(request\)/.test(passwordRoute), "Troca de senha deve validar o token no servidor.");
assert(/auth\.admin\.updateUserById/.test(passwordRoute), "Troca de senha deve usar a API administrativa no servidor.");
assert(/app_metadata:[\s\S]*must_change_password: false/.test(passwordRoute), "Flag de troca deve ser limpa em app_metadata.");
assert(/consumeRateLimit/.test(passwordRoute), "Troca de senha deve possuir rate limit distribuído.");
assert(/\/api\/auth\/admin-password-change/.test(passwordUi), "Tela de senha deve chamar a rota segura.");
assert(!/auth\.updateUser\(/.test(passwordUi), "Tela não pode alterar metadata protegida diretamente.");
assert(/app_metadata\?\.must_change_password/.test(loginRoute), "Login deve ler a flag protegida.");
assert(/app_metadata\?\.must_change_password/.test(adminShell), "Shell deve impor a flag protegida.");
assert(/PASSWORD_CHANGE_REQUIRED/.test(serverAuth) && /requiresPasswordChange/.test(serverAuth), "APIs administrativas devem bloquear a sessão até a troca de senha.");
assert(/app_metadata:\s*\{\s*must_change_password:\s*true/.test(adminsRoute), "Novos admins devem gravar a flag protegida.");
assert(/app_metadata:\s*\{\s*must_change_password:\s*true/.test(tenantRoute), "Novos proprietários devem gravar a flag protegida.");
assert(!/user_metadata:\s*\{[^}]*must_change_password:\s*true/.test(sources), "Nenhum fluxo novo pode confiar a flag protegida a user_metadata.");

const processCron = vercel.crons?.find((cron) => cron.path === "/api/internal/jobs/process");
assert(processCron?.schedule === "*/5 * * * *", "Executor de jobs deve permanecer a cada cinco minutos.");
assert(/Vercel Pro/i.test(read("docs/production/VERCEL_DEPLOYMENT.md")), "Requisito Vercel Pro deve estar documentado.");

console.log("OK - contratos de produção v5.5.8 validados.");
