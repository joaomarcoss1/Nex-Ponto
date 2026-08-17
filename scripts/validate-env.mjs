const production = process.env.NODE_ENV === "production" || process.argv.includes("--production");
const secrets = [
  "TENANT_CONTEXT_SECRET", "EMPLOYEE_SESSION_SECRET", "AUDIT_HASH_SALT",
  "RATE_LIMIT_HASH_SALT", "INTERNAL_JOBS_SECRET", "DEVICE_IDENTITY_SECRET",
  "RECEIPT_TOKEN_SECRET",
];
const required = [
  "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY", ...secrets,
];
const failures = [];
for (const name of required) {
  const value = process.env[name]?.trim();
  if (!value) failures.push(`${name}: ausente`);
  else if (secrets.includes(name) && value.length < 32) failures.push(`${name}: deve ter ao menos 32 caracteres`);
}
const appUrlValue = process.env.APP_URL?.trim()
  || process.env.NEXT_PUBLIC_APP_URL?.trim()
  || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "")
  || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
try {
  if (!appUrlValue) throw new Error("ausente");
  const appUrl = new URL(appUrlValue);
  if (production && ["localhost", "127.0.0.1", "::1"].includes(appUrl.hostname)) throw new Error("localhost não é permitido em produção");
  if (production && appUrl.protocol !== "https:") throw new Error("HTTPS é obrigatório em produção");
} catch (cause) {
  failures.push(`APP_URL/NEXT_PUBLIC_APP_URL: ${cause instanceof Error ? cause.message : "inválida"}`);
}
if (production && String(process.env.FEATURE_OFFICIAL_PAYROLL).toLowerCase() === "true") {
  failures.push("FEATURE_OFFICIAL_PAYROLL: mantenha false até homologação legal");
}
if (failures.length) {
  console.error("BLOQUEADOR — ambiente inválido:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log(`OK — ambiente ${production ? "de produção" : "local"} validado sem expor valores.`);
