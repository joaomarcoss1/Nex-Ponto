import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin, getSupabaseAuthClient } from "@/lib/server/db";
import { requireAdminLoginConfig } from "@/lib/config/environment";
import { fail, ok } from "@/lib/server/http";
import { getClientIp } from "@/lib/server/pin";
import { consumeRateLimit, privacyHash, rateLimitBucket } from "@/lib/server/rate-limit";
import { structuredLog } from "@/lib/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const loginSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(1024),
});

function noStore<T extends Response>(response: T) {
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  return response;
}

export async function POST(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return noStore(fail("E-mail ou senha inválidos.", 401, { code: "AUTH_SESSION_INVALID", requestId }));
  }

  const email = parsed.data.email.toLowerCase();
  try {
    requireAdminLoginConfig();
    const admin = getSupabaseAdmin();
    const ip = getClientIp(request.headers);
    const [ipLimit, accountLimit] = await Promise.all([
      consumeRateLimit({
        supabase: admin,
        bucket: rateLimitBucket(["admin-login", "ip", ip]),
        limit: 30,
        windowSeconds: 15 * 60,
        blockSeconds: 15 * 60,
      }),
      consumeRateLimit({
        supabase: admin,
        bucket: rateLimitBucket(["admin-login", "account", email]),
        limit: 10,
        windowSeconds: 15 * 60,
        blockSeconds: 30 * 60,
      }),
    ]);

    if (!ipLimit.allowed || !accountLimit.allowed) {
      const retryAfter = Math.max(ipLimit.retryAfterSeconds, accountLimit.retryAfterSeconds, 60);
      const response = fail("Muitas tentativas. Aguarde antes de tentar novamente.", 429, {
        code: "RATE_LIMITED",
        requestId,
      });
      response.headers.set("Retry-After", String(retryAfter));
      return noStore(response);
    }

    const authClient = getSupabaseAuthClient();
    const { data, error } = await authClient.auth.signInWithPassword(parsed.data);
    const success = Boolean(!error && data.session && data.user);

    await admin.from("admin_login_attempts").insert({
      email_hash: privacyHash(email),
      ip_hash: privacyHash(ip),
      success,
      error_code: success ? null : "INVALID_CREDENTIALS",
      request_id: requestId,
    }).then(() => undefined, () => undefined);

    if (!success || !data.session || !data.user) {
      return noStore(fail("E-mail ou senha inválidos.", 401, { code: "AUTH_SESSION_INVALID", requestId }));
    }

    return noStore(ok({
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      },
      user: {
        id: data.user.id,
        mustChangePassword: Boolean(data.user.user_metadata?.must_change_password),
      },
    }));
  } catch (cause) {
    const environment = cause instanceof Error && "code" in cause
      && String((cause as Error & { code?: unknown }).code) === "ENVIRONMENT_NOT_READY";
    if (environment) {
      structuredLog("error", "admin_login_environment_failed", {
        requestId,
        issues: (cause as Error & { issues?: unknown }).issues || [],
      });
    }
    return noStore(fail(
      "Não foi possível iniciar a sessão administrativa agora.",
      503,
      {
        code: environment ? "ENVIRONMENT_NOT_READY" : "AUTH_PROVIDER_UNAVAILABLE",
        requestId,
        technicalMessage: cause instanceof Error ? cause.message : "unknown",
      },
    ));
  }
}
