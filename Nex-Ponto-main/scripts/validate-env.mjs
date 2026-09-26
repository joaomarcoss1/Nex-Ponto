const args = new Set(process.argv.slice(2));
const mode = args.has("--full")
  ? "full"
  : args.has("--production")
    ? "production"
    : args.has("--build")
      ? "build"
      : "local";
const production = mode === "production" || mode === "full" || process.env.NODE_ENV === "production";

const secretNames = [
  "TENANT_CONTEXT_SECRET",
  "EMPLOYEE_SESSION_SECRET",
  "AUDIT_HASH_SALT",
  "RATE_LIMIT_HASH_SALT",
  "INTERNAL_JOBS_SECRET",
  "DEVICE_IDENTITY_SECRET",
  "RECEIPT_TOKEN_SECRET",
];

const capabilities = {
  build: {
    aliases: [["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"], ["SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]],
    required: ["SUPABASE_SERVICE_ROLE_KEY", "TENANT_CONTEXT_SECRET", "RATE_LIMIT_HASH_SALT", "AUDIT_HASH_SALT"],
  },
  production: {
    aliases: [["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"], ["SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]],
    required: ["SUPABASE_SERVICE_ROLE_KEY", "TENANT_CONTEXT_SECRET", "RATE_LIMIT_HASH_SALT", "AUDIT_HASH_SALT"],
  },
  full: {
    aliases: [["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"], ["SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]],
    required: [
      "SUPABASE_SERVICE_ROLE_KEY",
      "TENANT_CONTEXT_SECRET",
      "RATE_LIMIT_HASH_SALT",
      "AUDIT_HASH_SALT",
      "EMPLOYEE_SESSION_SECRET",
      "DEVICE_IDENTITY_SECRET",
      "RECEIPT_TOKEN_SECRET",
      "INTERNAL_JOBS_SECRET",
    ],
  },
  local: {
    aliases: [["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"], ["SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]],
    required: ["SUPABASE_SERVICE_ROLE_KEY", "TENANT_CONTEXT_SECRET", "RATE_LIMIT_HASH_SALT", "AUDIT_HASH_SALT"],
  },
};

function valueFor(names) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return { name, value };
  }
  return { name: names[0], value: "" };
}

function jwtPayload(token) {
  if (token.split(".").length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function validServiceRole(value) {
  if (!value) return false;
  if (value.startsWith("sb_secret_") && value.length >= 32) return true;
  return jwtPayload(value)?.role === "service_role";
}

function validAnon(value) {
  if (!value || value.length < 20 || /^(sua-chave|missing-anon-key|changeme)/i.test(value)) return false;
  const payload = jwtPayload(value);
  return payload ? ["anon", "authenticated"].includes(payload.role) : value.length >= 32;
}

function validateUrl(name, raw) {
  if (!raw) return `${name}: ausente`;
  if (/^[A-Z_][A-Z0-9_]*\s*=\s*https?:\/\//i.test(raw)) return `${name}: remova o prefixo duplicado`;
  try {
    const url = new URL(raw);
    if (production && ["localhost", "127.0.0.1", "::1"].includes(url.hostname)) return `${name}: localhost não é permitido em produção`;
    if (production && url.protocol !== "https:") return `${name}: HTTPS é obrigatório em produção`;
    if (!["http:", "https:"].includes(url.protocol)) return `${name}: protocolo inválido`;
  } catch {
    return `${name}: URL inválida`;
  }
  return "";
}

const selected = capabilities[mode];
const failures = [];

for (const aliases of selected.aliases) {
  const found = valueFor(aliases);
  if (aliases[0] === "SUPABASE_URL") {
    const failure = validateUrl("SUPABASE_URL", found.value);
    if (failure) failures.push(failure);
  }
  if (aliases[0] === "SUPABASE_ANON_KEY" && !validAnon(found.value)) {
    failures.push("SUPABASE_ANON_KEY: ausente ou inválida");
  }
}

for (const name of selected.required) {
  const value = process.env[name]?.trim();
  if (!value) failures.push(`${name}: ausente`);
  else if (secretNames.includes(name) && value.length < 32) failures.push(`${name}: deve ter ao menos 32 caracteres`);
}

const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
if (serviceRole && !validServiceRole(serviceRole)) {
  failures.push("SUPABASE_SERVICE_ROLE_KEY: a chave não possui formato service_role válido");
}

const appUrlValue = process.env.APP_URL?.trim()
  || process.env.NEXT_PUBLIC_APP_URL?.trim()
  || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "")
  || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "")
  || (!production ? "http://127.0.0.1:3000" : "");
const appUrlFailure = validateUrl("APP_URL", appUrlValue);
if (appUrlFailure) failures.push(appUrlFailure);

if (String(process.env.FEATURE_OFFICIAL_PAYROLL).toLowerCase() === "true") {
  failures.push("FEATURE_OFFICIAL_PAYROLL: mantenha false até homologação legal externa");
}

if (failures.length) {
  console.error(`BLOQUEADOR - ambiente inválido (${mode}):\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log(`OK - ambiente validado em modo ${mode} sem expor valores.`);
