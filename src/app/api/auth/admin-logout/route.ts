import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/db";
import { ok } from "@/lib/server/http";
import { clearAdminSessionCookies, readAdminAccessToken } from "@/lib/server/admin-session-cookie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const token = readAdminAccessToken(request);
  if (token) {
    // Best-effort: invalidate the refresh token server-side too, not just the
    // cookie. A network hiccup here shouldn't block the user from logging out.
    // auth.admin.* requires the service-role client, not the anon one.
    await getSupabaseAdmin().auth.admin.signOut(token, "global").catch(() => undefined);
  }
  const response = ok({ ok: true });
  clearAdminSessionCookies(response);
  return response;
}
