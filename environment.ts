const SECRET_NAMES = [
  "TENANT_CONTEXT_SECRET",
  "EMPLOYEE_SESSION_SECRET",
  "AUDIT_HASH_SALT",
  "RATE_LIMIT_HASH_SALT",
  "INTERNAL_JOBS_SECRET",
  "DEVICE_IDENTITY_SECRET",
  "RECEIPT_TOKEN_SECRET",
] as const;

const CORE_SERVER_NAMES = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "TENANT_CONTEXT_SECRET",
  "AUDIT_HASH_SALT",
  "RATE_LIMIT_HASH_SALT",
] as const;

export type EnvironmentIssue = {
  name: string;
  reason:
    | "missing"
    | "too_short"
    | "invalid_url"
    | "insecure_url"
    | "localhost_in_production"
    | "invalid_service_role"
    | "invalid_anon_key"
    | "feature_not_homologated";
};

type Capability =
  | "browserRuntime"
  | "supabaseAdmin"
  | "adminLogin"
  | "tenantContext"
  | "employeeSession"
  | "device"
  | "receipt"
  | "jobs"
  | "build"
  | "full";

function issue(name: string, reason: EnvironmentIssue["reason"]): EnvironmentIssue {
  return { name, reason };
}

function readEnv(env: NodeJS.ProcessEnv, ...names: string[]) {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) return { name, value };
  }
  return { name: names[0], value: "" };
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function inspectServiceRoleKey(value: string | undefined) {
  const key = value?.trim() || "";
  if (!key) return { valid: false, format: "missing" as const };
  if (key.startsWith("sb_secret_") && key.length >= 32) {
    return { valid: true, format: "supabase_secret" as const };
  }
  const payload = decodeJwtPayload(key);
  return {
    valid: payload?.role === "service_role",
    format: "jwt" as const,
  };
}

function inspectAnonKey(value: string | undefined) {
  const key = value?.trim() || "";
  if (!key) return { valid: false };
  if (key.length < 20 || /^(sua-chave|missing-anon-key|changeme)/i.test(key)) return { valid: false };
  const payload = decodeJwtPayload(key);
  if (!payload) return { valid: key.length >= 32 };
  return { valid: payload.role === "anon" || payload.role === "authenticated" };
}

function normalizeUrl(candidate: string, production: boolean) {
  if (/^[A-Z_][A-Z0-9_]*\s*=\s*https?:\/\//i.test(candidate)) {
    throw new Error("URL oficial inválida: remova o nome duplicado da variável.");
  }
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("URL oficial inválida.");
  }
  if (production && ["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error("A URL oficial não pode usar localhost em produção.");
  }
  if (production && url.protocol !== "https:") {
    throw new Error("A URL oficial deve usar HTTPS em produção.");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("URL oficial inválida.");
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function addUrlIssue(issues: EnvironmentIssue[], name: string, cause: unknown) {
  const message = cause instanceof Error ? cause.message : "invalid_url";
  const reason = message.includes("localhost")
    ? "localhost_in_production"
    : message.includes("HTTPS")
      ? "insecure_url"
      : message.includes("ausente") || message.includes("missing")
        ? "missing"
        : "invalid_url";
  issues.push(issue(name, reason));
}

export function resolveSupabaseUrl(env: NodeJS.ProcessEnv = process.env, production = env.NODE_ENV === "production") {
  const found = production
    ? readEnv(env, "SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL")
    : readEnv(env, "SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "TEST_SUPABASE_URL");
  if (!found.value) throw new Error("SUPABASE_URL ausente.");
  return normalizeUrl(found.value, production);
}

export function resolveSupabaseAnonKey(env: NodeJS.ProcessEnv = process.env) {
  const production = env.NODE_ENV === "production";
  const found = production
    ? readEnv(env, "SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY")
    : readEnv(env, "SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "TEST_SUPABASE_ANON_KEY");
  if (!found.value) throw new Error("SUPABASE_ANON_KEY ausente.");
  if (!inspectAnonKey(found.value).valid) throw new Error("SUPABASE_ANON_KEY inválida.");
  return found.value;
}

export function resolveAppUrl(options: {
  env?: NodeJS.ProcessEnv;
  requestOrigin?: string;
  production?: boolean;
}) {
  const env = options.env ?? process.env;
  const production = options.production ?? env.NODE_ENV === "production";
  const vercelHost = env.VERCEL_PROJECT_PRODUCTION_URL || env.VERCEL_URL;
  const candidate = env.APP_URL?.trim()
    || env.NEXT_PUBLIC_APP_URL?.trim()
    || (vercelHost ? `https://${vercelHost}` : "")
    || (!production ? options.requestOrigin?.trim() || "http://127.0.0.1:3000" : "");
  if (!candidate) throw new Error("URL oficial ausente.");
  return normalizeUrl(candidate, production);
}

function collectCapabilityIssues(
  capability: Capability,
  env: NodeJS.ProcessEnv,
  options: { production?: boolean; includeAppUrl?: boolean } = {},
) {
  const production = options.production ?? env.NODE_ENV === "production";
  const issues: EnvironmentIssue[] = [];
  const needUrl = ["browserRuntime", "supabaseAdmin", "adminLogin", "jobs", "build", "full"].includes(capability);
  const needAnon = ["browserRuntime", "adminLogin", "build", "full"].includes(capability);
  const needServiceRole = ["supabaseAdmin", "adminLogin", "build", "full", "jobs"].includes(capability);
  const requiredSecrets = new Set<string>();

  if (["adminLogin", "build", "full"].includes(capability)) {
    requiredSecrets.add("RATE_LIMIT_HASH_SALT");
    requiredSecrets.add("AUDIT_HASH_SALT");
  }
  if (["tenantContext", "build", "full"].includes(capability)) requiredSecrets.add("TENANT_CONTEXT_SECRET");
  if (["employeeSession", "full"].includes(capability)) requiredSecrets.add("EMPLOYEE_SESSION_SECRET");
  if (["device", "full"].includes(capability)) requiredSecrets.add("DEVICE_IDENTITY_SECRET");
  if (["receipt", "full"].includes(capability)) requiredSecrets.add("RECEIPT_TOKEN_SECRET");
  if (["jobs", "full"].includes(capability)) requiredSecrets.add("INTERNAL_JOBS_SECRET");
  if (capability === "full") CORE_SERVER_NAMES.forEach((name) => requiredSecrets.add(name));

  if (needUrl) {
    try {
      resolveSupabaseUrl(env, production);
    } catch (cause) {
      addUrlIssue(issues, "SUPABASE_URL", cause);
    }
  }

  if (needAnon) {
    try {
      resolveSupabaseAnonKey(env);
    } catch (cause) {
      issues.push(issue("SUPABASE_ANON_KEY", cause instanceof Error && cause.message.includes("inválida") ? "invalid_anon_key" : "missing"));
    }
  }

  if (needServiceRole) {
    const value = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!value) issues.push(issue("SUPABASE_SERVICE_ROLE_KEY", "missing"));
    else if (!inspectServiceRoleKey(value).valid) issues.push(issue("SUPABASE_SERVICE_ROLE_KEY", "invalid_service_role"));
  }

  for (const name of requiredSecrets) {
    if (name === "SUPABASE_SERVICE_ROLE_KEY") continue;
    const value = env[name]?.trim();
    if (!value) issues.push(issue(name, "missing"));
    else if (SECRET_NAMES.includes(name as (typeof SECRET_NAMES)[number]) && value.length < 32) {
      issues.push(issue(name, "too_short"));
    }
  }

  if (options.includeAppUrl !== false && ["browserRuntime", "build", "full"].includes(capability)) {
    try {
      resolveAppUrl({ env, production });
    } catch (cause) {
      addUrlIssue(issues, "APP_URL", cause);
    }
  }

  if (["build", "full"].includes(capability) && String(env.FEATURE_OFFICIAL_PAYROLL).toLowerCase() === "true") {
    issues.push(issue("FEATURE_OFFICIAL_PAYROLL", "feature_not_homologated"));
  }

  return { ok: issues.length === 0, issues };
}

export function validateServerEnvironment(
  env: NodeJS.ProcessEnv = process.env,
  options: { production?: boolean; includeAppUrl?: boolean; capability?: Capability } = {},
) {
  return collectCapabilityIssues(options.capability ?? "full", env, options);
}

export function validateFullProductionEnvironment(env: NodeJS.ProcessEnv = process.env) {
  return collectCapabilityIssues("full", env, { production: true });
}

function throwConfigurationError(message: string, issues: EnvironmentIssue[]) {
  const error = new Error(message);
  Object.assign(error, { code: "ENVIRONMENT_NOT_READY", issues });
  throw error;
}

export function requireSupabaseBrowserServerConfig(options: { requestOrigin?: string } = {}) {
  const result = collectCapabilityIssues("browserRuntime", process.env, { includeAppUrl: true });
  if (!result.ok) throwConfigurationError("A configuração pública do Supabase está incompleta.", result.issues);
  return {
    supabaseUrl: resolveSupabaseUrl(),
    supabaseAnonKey: resolveSupabaseAnonKey(),
    appUrl: resolveAppUrl({ requestOrigin: options.requestOrigin }),
  };
}

export function requireSupabaseAdminConfig() {
  const result = collectCapabilityIssues("supabaseAdmin", process.env, { includeAppUrl: false });
  if (!result.ok) throwConfigurationError("A configuração administrativa do Supabase está incompleta.", result.issues);
  return {
    supabaseUrl: resolveSupabaseUrl(),
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  };
}

export function requireSupabaseAuthConfig() {
  const result = collectCapabilityIssues("browserRuntime", process.env, { includeAppUrl: false });
  if (!result.ok) throwConfigurationError("A configuração de autenticação do Supabase está incompleta.", result.issues);
  return {
    supabaseUrl: resolveSupabaseUrl(),
    supabaseAnonKey: resolveSupabaseAnonKey(),
  };
}

export function requireAdminLoginConfig() {
  const result = collectCapabilityIssues("adminLogin", process.env, { includeAppUrl: false });
  if (!result.ok) throwConfigurationError("A configuração do login administrativo está incompleta.", result.issues);
  return {
    supabaseUrl: resolveSupabaseUrl(),
    supabaseAnonKey: resolveSupabaseAnonKey(),
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  };
}

export function requireTenantContextConfig() {
  const result = collectCapabilityIssues("tenantContext", process.env, { includeAppUrl: false });
  if (!result.ok) throwConfigurationError("A configuração de contexto de empresa está incompleta.", result.issues);
  return { tenantContextSecret: process.env.TENANT_CONTEXT_SECRET! };
}

export function requireEmployeeSessionConfig() {
  const result = collectCapabilityIssues("employeeSession", process.env, { includeAppUrl: false });
  if (!result.ok) throwConfigurationError("A configuração de sessão do funcionário está incompleta.", result.issues);
  return { employeeSessionSecret: process.env.EMPLOYEE_SESSION_SECRET! };
}

export function requireDeviceConfig() {
  const result = collectCapabilityIssues("device", process.env, { includeAppUrl: false });
  if (!result.ok) throwConfigurationError("A configuração de dispositivos está incompleta.", result.issues);
  return { deviceIdentitySecret: process.env.DEVICE_IDENTITY_SECRET! };
}

export function requireReceiptConfig() {
  const result = collectCapabilityIssues("receipt", process.env, { includeAppUrl: false });
  if (!result.ok) throwConfigurationError("A configuração de recibos está incompleta.", result.issues);
  return { receiptTokenSecret: process.env.RECEIPT_TOKEN_SECRET! };
}

export function requireJobsConfig() {
  const result = collectCapabilityIssues("jobs", process.env, { includeAppUrl: false });
  if (!result.ok) throwConfigurationError("A configuração de jobs está incompleta.", result.issues);
  return {
    internalJobsSecret: process.env.INTERNAL_JOBS_SECRET!,
    cronSecret: process.env.CRON_SECRET || process.env.INTERNAL_JOBS_SECRET!,
    executionMode: process.env.JOB_EXECUTION_MODE === "inline" ? "inline" as const : "external" as const,
  };
}

export function requireServerEnvironment() {
  const admin = requireSupabaseAdminConfig();
  const auth = requireSupabaseAuthConfig();
  return {
    supabaseUrl: admin.supabaseUrl,
    supabaseAnonKey: auth.supabaseAnonKey,
    supabaseServiceRoleKey: admin.supabaseServiceRoleKey,
  };
}
