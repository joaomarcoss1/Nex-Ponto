const SECRET_NAMES = [
  "TENANT_CONTEXT_SECRET",
  "EMPLOYEE_SESSION_SECRET",
  "AUDIT_HASH_SALT",
  "RATE_LIMIT_HASH_SALT",
  "INTERNAL_JOBS_SECRET",
  "DEVICE_IDENTITY_SECRET",
  "RECEIPT_TOKEN_SECRET",
] as const;

const REQUIRED_SERVER_NAMES = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  ...SECRET_NAMES,
] as const;

export type EnvironmentIssue = {
  name: string;
  reason: "missing" | "too_short" | "invalid_url" | "insecure_url" | "localhost_in_production";
};

export function validateServerEnvironment(
  env: NodeJS.ProcessEnv = process.env,
  options: { production?: boolean; includeAppUrl?: boolean } = {},
) {
  const production = options.production ?? env.NODE_ENV === "production";
  const issues: EnvironmentIssue[] = [];
  for (const name of REQUIRED_SERVER_NAMES) {
    const value = env[name]?.trim();
    if (!value) issues.push({ name, reason: "missing" });
  }
  for (const name of SECRET_NAMES) {
    const value = env[name]?.trim();
    if (value && value.length < 32) issues.push({ name, reason: "too_short" });
  }
  if (options.includeAppUrl !== false) {
    try {
      resolveAppUrl({ env, production });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "invalid_url";
      const reason = message.includes("localhost")
        ? "localhost_in_production"
        : message.includes("HTTPS")
          ? "insecure_url"
          : message.includes("ausente")
            ? "missing"
            : "invalid_url";
      issues.push({ name: "APP_URL", reason });
    }
  }
  return { ok: issues.length === 0, issues };
}

function normalizeUrl(candidate: string, production: boolean) {
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

export function requireServerEnvironment() {
  const result = validateServerEnvironment();
  if (!result.ok) {
    const error = new Error("A configuração do serviço está incompleta.");
    Object.assign(error, { code: "ENVIRONMENT_NOT_READY", issues: result.issues });
    throw error;
  }
  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  };
}
