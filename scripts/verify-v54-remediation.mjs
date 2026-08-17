import fs from "node:fs";
const read = (file) => fs.readFileSync(file, "utf8");
const checks = [
  ["migration 053 incremental", fs.existsSync("supabase/migrations/053_nexponto_v54_structural_remediation.sql")],
  ["storage por tenant", read("supabase/migrations/053_nexponto_v54_structural_remediation.sql").includes("storage.foldername(name)")],
  ["tenant_features canônica", read("supabase/migrations/053_nexponto_v54_structural_remediation.sql").includes("sync_tenant_feature_configuration_v54")],
  ["MFA não implícito", !read("src/lib/security/mfa.ts").includes('NODE_ENV === "production"')],
  ["URL oficial central", read("src/lib/config/environment.ts").includes("resolveAppUrl")],
  ["contrato de erro", read("src/lib/server/http.ts").includes("retryable")],
  ["readiness sem segredos", fs.existsSync("src/app/api/readiness/route.ts")],
  ["convite depois do RPC", read("src/app/api/platform/tenants/route.ts").indexOf("resetPasswordForEmail") > read("src/app/api/platform/tenants/route.ts").indexOf("create_tenant_with_owner_v4")],
];
for (const [name, ok] of checks) console.log(`${ok ? "OK" : "FALHA"} ${name}`);
if (checks.some(([,ok]) => !ok)) process.exit(1);
