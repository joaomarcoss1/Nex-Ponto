const production = process.env.NODE_ENV === "production";
const productionGate = production || process.env.PRODUCTION_SECURITY_GATES === "true" || process.env.CI === "true";

const required = [
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
  "NEXT_PUBLIC_APP_URL",
  "DEFAULT_TIMEZONE",
  "REPORT_EXPORT_BUCKET",
  "EXPORTS_BUCKET",
  "JOB_WORKER_ID",
  "MALWARE_SCANNER_MODE",
];

const productionRequired = [
  "OBSERVABILITY_DSN",
  "OBSERVABILITY_ENVIRONMENT",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "TEST_SUPABASE_URL",
  "TEST_SUPABASE_ANON_KEY",
  "TEST_TENANT_A_EMAIL",
  "TEST_TENANT_A_PASSWORD",
  "TEST_TENANT_B_ID",
  "TEST_STORAGE_JUSTIFICATION_PATH_A",
  "TEST_STORAGE_JUSTIFICATION_PATH_B",
  "BACKUP_RESTORE_EVIDENCE_URL",
];

const names = productionGate ? [...required, ...productionRequired] : required;
const missing = names.filter((name) => !process.env[name]);
const weak = names.filter(
  (name) => /SECRET|SALT/.test(name) && process.env[name] && process.env[name].length < 32,
);
const officialPayrollEnabled = String(process.env.FEATURE_OFFICIAL_PAYROLL).toLowerCase() === "true";
function validTimezone(value) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date("2026-01-01T12:00:00Z"));
    return true;
  } catch {
    return false;
  }
}

const invalid = [];
if (process.env.DEFAULT_TIMEZONE && !validTimezone(process.env.DEFAULT_TIMEZONE)) {
  invalid.push("DEFAULT_TIMEZONE");
}
if (productionGate && process.env.MALWARE_SCANNER_MODE === "metadata_only") {
  invalid.push("MALWARE_SCANNER_MODE=metadata_only");
}

if (
  missing.length ||
  weak.length ||
  invalid.length ||
  (productionGate && officialPayrollEnabled)
) {
  if (missing.length) console.error(`Variaveis ausentes: ${missing.join(", ")}`);
  if (weak.length) console.error(`Segredos com menos de 32 caracteres: ${weak.join(", ")}`);
  if (invalid.length) console.error(`Variaveis invalidas: ${invalid.join(", ")}`);
  if (productionGate && officialPayrollEnabled) {
    console.error("FEATURE_OFFICIAL_PAYROLL deve permanecer false ate homologacao formal.");
  }
  process.exit(1);
}

console.log(`Ambiente ${productionGate ? "de gate controlado" : "local"} validado.`);
