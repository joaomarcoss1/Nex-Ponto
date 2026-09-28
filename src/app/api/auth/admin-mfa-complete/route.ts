import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAuthClient } from "@/lib/server/db";
import { fail, ok } from "@/lib/server/http";
import { setAdminSessionCookies } from "@/lib/server/admin-session-cookie";
import { decodeAal } from "@/lib/security/mfa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  access_token: z.string().min(20),
  refresh_token: z.string().min(10),
});

/**
 * Exchanges a freshly-verified aal2 session (the client just completed
 * supabase.auth.mfa.challengeAndVerify with it) for the httpOnly session
 * cookie. The client discards its local copy right after calling this —
 * from here on the token never touches browser JS again.
 */
export async function POST(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail("Confirmação de dois fatores inválida.", 400, { code: "VALIDATION_FAILED", requestId });
  }

  const { access_token, refresh_token } = parsed.data;
  if (decodeAal(access_token) !== "aal2") {
    return fail("A confirmação de dois fatores não elevou a sessão. Tente novamente.", 401, { code: "MFA_REQUIRED", requestId });
  }

  const authClient = getSupabaseAuthClient();
  const { data, error } = await authClient.auth.getUser(access_token);
  if (error || !data.user) {
    return fail("Sessão inválida.", 401, { code: "AUTH_SESSION_INVALID", requestId });
  }

  const response = ok({ ok: true });
  setAdminSessionCookies(response, { access_token, refresh_token });
  return response;
}
