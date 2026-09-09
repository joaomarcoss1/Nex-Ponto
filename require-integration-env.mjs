const required = [
  "TEST_SUPABASE_URL","TEST_SUPABASE_ANON_KEY","TEST_SUPABASE_SERVICE_ROLE_KEY",
  "TEST_TENANT_A_EMAIL","TEST_TENANT_A_PASSWORD","TEST_TENANT_A_ID","TEST_TENANT_A_EMPLOYEE_ID",
  "TEST_TENANT_B_ID","TEST_TENANT_B_BRANCH_ID","TEST_TENANT_B_EMPLOYEE_ID",
];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`BLOQUEADOR: integração real não configurada (${missing.join(", ")}).`);
  process.exit(2);
}
console.log("OK — credenciais de integração presentes; testes RLS não serão ignorados.");
