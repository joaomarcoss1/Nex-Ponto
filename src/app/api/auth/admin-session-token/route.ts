import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/server/http";
import { readAdminAccessToken, readAdminRefreshToken } from "@/lib/server/admin-session-cookie";
import { authenticatedUser } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Hands the current session's tokens back to the browser — the one place
 * this app deliberately does that outside the login handshake. The
 * Supabase JS SDK's MFA methods (enroll/unenroll/listFactors) only operate
 * against a client-side session, so the MFA settings page needs a live
 * client for as long as it's open, then discards it (auth.signOut({scope:
 * 'local'})) the moment it's done. Every other admin request stays
 * cookie-only. Requires the same valid, non-MFA-blocked session as any other
 * admin route — this doesn't grant anything the caller's cookie didn't
 * already grant it.
 */
export async function POST(request: NextRequest) {
  const authResult = await authenticatedUser(request);
  if ("error" in authResult) return authResult.error;

  const accessToken = readAdminAccessToken(request);
  const refreshToken = readAdminRefreshToken(request);
  if (!accessToken || !refreshToken) {
    return fail("Sessão administrativa não encontrada.", 401, { code: "AUTH_SESSION_REQUIRED" });
  }
  return ok({ access_token: accessToken, refresh_token: refreshToken });
}
