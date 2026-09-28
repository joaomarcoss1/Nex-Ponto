import { NextRequest } from "next/server";
import { getSupabaseAuthClient } from "@/lib/server/db";
import { fail, ok } from "@/lib/server/http";
import {
  clearAdminSessionCookies,
  readAdminRefreshToken,
  setAdminSessionCookies,
} from "@/lib/server/admin-session-cookie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Called by adminFetch when a request comes back 401 with an expired-session
 * code. Exchanges the httpOnly refresh cookie for a new access token without
 * the client ever seeing either token — the access cookie's own 1h TTL is
 * the only thing driving re-authentication normally; this just recovers from
 * it transparently instead of bouncing the admin to the login screen.
 */
export async function POST(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  const refreshToken = readAdminRefreshToken(request);
  if (!refreshToken) {
    return fail("Sessão administrativa não encontrada.", 401, { code: "AUTH_SESSION_REQUIRED", requestId });
  }

  const authClient = getSupabaseAuthClient();
  const { data, error } = await authClient.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session) {
    const response = fail("Sessão expirada. Entre novamente.", 401, { code: "AUTH_SESSION_INVALID", requestId });
    clearAdminSessionCookies(response);
    return response;
  }

  const response = ok({ ok: true });
  setAdminSessionCookies(response, {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_in: data.session.expires_in,
  });
  return response;
}
