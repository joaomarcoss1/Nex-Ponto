import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.TEST_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("BLOQUEADOR: configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY para auditar o banco real.");
  process.exit(2);
}

const expectedTables = [
  "tenants","admin_users","tenant_memberships","platform_superadmins","tenant_onboarding_steps",
  "tenant_features","tenant_settings","tenant_branding","branches","branch_operating_hours","employees",
  "work_schedules","schedule_cycles","schedule_cycle_days","schedule_publications","shift_templates",
  "shift_template_intervals","time_entries","work_sessions","work_session_events","support_access_sessions",
  "platform_idempotency_keys","tenant_subscriptions",
];
const expectedFunctions = [
  "create_tenant_with_owner_v4","bootstrap_tenant_owner_v4","upsert_schedule_cycle_v51",
  "assign_schedule_cycle_v51","register_time_entry_v4","audit_database_structure_v54",
  "has_tenant_permission_v54",
];
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await supabase.rpc("audit_database_structure_v54");
if (error) {
  console.error(`BLOQUEADOR: RPC de auditoria indisponível (${error.message}). Aplique a migration 053.`);
  process.exit(2);
}
const tables = new Set(data.tables || []);
const functions = new Set(data.functions || []);
let blocked = false;
for (const table of expectedTables) {
  const ok = tables.has(table);
  console.log(`${ok ? "OK" : "AUSENTE"} tabela ${table}`);
  blocked ||= !ok;
}
for (const fn of expectedFunctions) {
  const ok = functions.has(fn);
  console.log(`${ok ? "OK" : "AUSENTE"} função ${fn}`);
  blocked ||= !ok;
}
const featureColumns = new Set(data.tenantFeatureColumns || []);
console.log(`${featureColumns.has("configuration") ? "OK" : "INCOMPATÍVEL"} tenant_features.configuration canônica`);
console.log(`${featureColumns.has("config") ? "LEGADO" : "OK"} tenant_features.config compatibilidade temporária`);
console.log(`${(data.buckets || []).includes("justificativas") ? "OK" : "AUSENTE"} bucket justificativas`);
console.log(`${(data.rlsDisabled || []).length ? "BLOQUEADOR" : "OK"} RLS nas tabelas com tenant_id`);
if ((data.rlsDisabled || []).length) console.log(`  Sem RLS: ${data.rlsDisabled.join(", ")}`);
console.log(`${data.schemaVersion === "5.4.0" ? "OK" : "REQUER MIGRATION"} schema ${data.schemaVersion || "não identificado"}`);
if (blocked || (data.rlsDisabled || []).length || data.schemaVersion !== "5.4.0") process.exit(1);
