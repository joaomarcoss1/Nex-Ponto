import type { NextRequest, NextResponse } from "next/server";

const ACCESS_COOKIE = "nexponto_admin_at";
const REFRESH_COOKIE = "nexponto_admin_rt";
const DEFAULT_MAX_AGE_SECONDS = 60 * 60; // Supabase access tokens default to a 1h TTL.
const REFRESH_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge,
  };
}

export function setAdminSessionCookies(
  response: NextResponse,
  session: { access_token: string; refresh_token: string; expires_in?: number },
) {
  const accessTtl = session.expires_in && session.expires_in > 0 ? session.expires_in : DEFAULT_MAX_AGE_SECONDS;
  response.cookies.set(ACCESS_COOKIE, session.access_token, cookieOptions(accessTtl));
  response.cookies.set(REFRESH_COOKIE, session.refresh_token, cookieOptions(REFRESH_MAX_AGE_SECONDS));
}

export function clearAdminSessionCookies(response: NextResponse) {
  response.cookies.set(ACCESS_COOKIE, "", cookieOptions(0));
  response.cookies.set(REFRESH_COOKIE, "", cookieOptions(0));
}

export function readAdminAccessToken(request: NextRequest): string | null {
  return request.cookies.get(ACCESS_COOKIE)?.value || null;
}

export function readAdminRefreshToken(request: NextRequest): string | null {
  return request.cookies.get(REFRESH_COOKIE)?.value || null;
}
