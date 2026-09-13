import { NextRequest } from "next/server";
import { z } from "zod";
import { authenticatedUser } from "@/lib/server/auth";
import { getSupabaseAdmin } from "@/lib/server/db";
import { fail, ok } from "@/lib/server/http";
import { getClientIp } from "@/lib/server/pin";
import { consumeRateLimit, rateLimitBucket } from "@/lib/server/rate-limit";
import { structuredLog } from "@/lib/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const passwordSchema = z.object({
  password: z.string().min(10).max(128),
  confirmation: z.string().min(10).max(128),
}).superRefine((value, context) => {
  if (!/[A-Za-zÀ-ÿ]/.test(value.password) || !/\d/.test(value.password)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["password"],
      message: "Use pelo menos 10 caracteres, incluindo letra e número.",
    });
  }
  if (value.password !== value.confirmation) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["confirmation"],
      message: "A confirmação não corresponde à nova senha.",
    });
  }
});

function noStore<T extends Response>(response: T) {
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  return response;
}

export async function POST(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  const auth = await authenticatedUser(request);
  if ("error" in auth) return noStore(auth.error);

  const parsed = passwordSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return noStore(fail(parsed.error.issues[0]?.message || "Nova senha inválida.", 400, {
      code: "VALIDATION_ERROR",
      requestId,
    }));
  }

  try {
    const supabase = getSupabaseAdmin();
    const [userLimit, ipLimit] = await Promise.all([
      consumeRateLimit({
        supabase,
        bucket: rateLimitBucket(["admin-password-change", "user", auth.user.id]),
        limit: 5,
        windowSeconds: 15 * 60,
        blockSeconds: 30 * 60,
      }),
      consumeRateLimit({
        supabase,
        bucket: rateLimitBucket(["admin-password-change", "ip", getClientIp(request.headers)]),
        limit: 15,
        windowSeconds: 15 * 60,
        blockSeconds: 30 * 60,
      }),
    ]);
    if (!userLimit.allowed || !ipLimit.allowed) {
      const retryAfter = Math.max(userLimit.retryAfterSeconds, ipLimit.retryAfterSeconds, 60);
      const response = fail("Muitas tentativas. Aguarde antes de tentar novamente.", 429, {
        code: "RATE_LIMITED",
        requestId,
      });
      response.headers.set("Retry-After", String(retryAfter));
      return noStore(response);
    }

    const [adminProfile, platformProfile] = await Promise.all([
      supabase.from("admin_users").select("id", { count: "exact", head: true })
        .eq("auth_user_id", auth.user.id).eq("active", true),
      supabase.from("platform_superadmins").select("id", { count: "exact", head: true })
        .eq("auth_user_id", auth.user.id).eq("active", true),
    ]);
    if (adminProfile.error || platformProfile.error) {
      return noStore(fail("Não foi possível validar o perfil administrativo.", 503, {
        code: "DATABASE_ERROR",
        requestId,
      }));
    }
    if (!Number(adminProfile.count || 0) && !Number(platformProfile.count || 0)) {
      return noStore(fail("Perfil administrativo ativo não encontrado.", 403, {
        code: "ADMIN_PROFILE_NOT_FOUND",
        requestId,
      }));
    }

    const userMetadata = { ...(auth.user.user_metadata || {}) };
    delete userMetadata.must_change_password;
    delete userMetadata.role;
    const { error } = await supabase.auth.admin.updateUserById(auth.user.id, {
      password: parsed.data.password,
      user_metadata: userMetadata,
      app_metadata: {
        ...(auth.user.app_metadata || {}),
        must_change_password: false,
      },
    });
    if (error) {
      structuredLog("error", "admin_password_change_failed", {
        requestId,
        userId: auth.user.id,
        code: error.code,
      });
      return noStore(fail("Não foi possível atualizar a senha.", 503, {
        code: "AUTH_PROVIDER_UNAVAILABLE",
        requestId,
      }));
    }

    structuredLog("info", "admin_password_changed", { requestId, userId: auth.user.id });
    return noStore(ok({ changed: true, requestId }));
  } catch (cause) {
    structuredLog("error", "admin_password_change_unavailable", {
      requestId,
      userId: auth.user.id,
      technicalMessage: cause instanceof Error ? cause.message : "unknown",
    });
    return noStore(fail("Não foi possível atualizar a senha agora.", 503, {
      code: "AUTH_PROVIDER_UNAVAILABLE",
      requestId,
    }));
  }
}
