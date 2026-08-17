import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const exists = (file) => fs.existsSync(file);

const checks = [
  ["migration 055 incremental", exists("supabase/migrations/055_nexponto_v55_admin_rbac_operations.sql")],
  ["RPC transacional de criação de admin", read("supabase/migrations/055_nexponto_v55_admin_rbac_operations.sql").includes("create_tenant_admin_v55")],
  ["RPC transacional de atualização de admin", read("supabase/migrations/055_nexponto_v55_admin_rbac_operations.sql").includes("update_tenant_admin_v55")],
  ["desativação controlada de admin", read("supabase/migrations/055_nexponto_v55_admin_rbac_operations.sql").includes("disable_tenant_admin_v55")],
  ["reconciliação admin x membership", read("supabase/migrations/055_nexponto_v55_admin_rbac_operations.sql").includes("reconcile_admin_memberships_v55")],
  ["limpeza operacional versionada", read("supabase/migrations/055_nexponto_v55_admin_rbac_operations.sql").includes("cleanup_operational_data_v55")],
  ["permissões administrativas compartilhadas", read("src/lib/security/admin-route-permissions.ts").includes("ADMIN_NAV_PERMISSION_BY_PATH")],
  ["requireAdmin usa matriz por rota", read("src/lib/server/auth.ts").includes("adminRouteRequirement(request.nextUrl.pathname")],
  ["menu usa mesma matriz RBAC", read("src/components/admin/AdminShell.tsx").includes("ADMIN_NAV_PERMISSION_BY_PATH")],
  ["contrato de erro propaga x-request-id", read("src/lib/server/http.ts").includes('"x-request-id"')],
  ["relatórios paginados sem limit fixo", read("src/app/api/admin/reports/route.ts").includes("fetchAllPaginated")],
  ["anexos bloqueados até scan clean", read("src/app/api/admin/justifications/route.ts").includes('attachment_scan_status !== "clean"')],
  ["device API com rate limit distribuído", read("src/app/api/public/device/route.ts").includes("consumeRateLimit")],
  ["testes cobrem matriz de rotas", read("src/lib/security/__tests__/authorization.test.ts").includes("adminRouteRequirement")],
];

for (const [name, ok] of checks) console.log(`${ok ? "OK" : "FALHA"} ${name}`);
if (checks.some(([, ok]) => !ok)) process.exit(1);
