import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("BLOQUEADO: configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY para auditar grants reais.");
  process.exit(2);
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await supabase.rpc("audit_sensitive_security_definer_grants_v551");
if (error) {
  console.error(`BLOQUEADO: não foi possível executar audit_sensitive_security_definer_grants_v551: ${error.message}`);
  process.exit(2);
}

const exposed = (data || []).filter((row) => Array.isArray(row.exposed_to) && row.exposed_to.length > 0);
if (exposed.length) {
  console.error("FALHA: RPC SECURITY DEFINER sensível exposta indevidamente:");
  for (const row of exposed) console.error(`- ${row.function_name}(${row.identity_arguments}) -> ${row.exposed_to.join(", ")}`);
  process.exit(1);
}

console.log(`OK: ${(data || []).length} funções SECURITY DEFINER sensíveis sem exposição pública/anon/authenticated.`);
