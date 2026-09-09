import { NextRequest, NextResponse } from "next/server";

const PUBLIC_TENANT_COOKIE = "nexponto-public-tenant";
const TENANT_IDENTIFIER = /^[a-z0-9][a-z0-9-]{1,62}$|^[a-f0-9]{24,96}$/;

export function middleware(request: NextRequest) {
  const queryTenant = (request.nextUrl.searchParams.get("empresa") || request.nextUrl.searchParams.get("tenant") || "").trim().toLowerCase();
  const cookieTenant = request.cookies.get(PUBLIC_TENANT_COOKIE)?.value || "";
  const identifier = TENANT_IDENTIFIER.test(queryTenant)
    ? queryTenant
    : TENANT_IDENTIFIER.test(cookieTenant)
      ? cookieTenant
      : "";
  const headers = new Headers(request.headers);
  const requestId = headers.get("x-request-id") || crypto.randomUUID();
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const contentSecurityPolicy = [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "object-src 'none'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    ...(process.env.NODE_ENV === "production" ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
  headers.set("x-request-id", requestId);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", contentSecurityPolicy);
  if (identifier) headers.set("x-nexponto-tenant", identifier);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("x-request-id", requestId);
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  if (queryTenant && identifier === queryTenant) {
    response.cookies.set(PUBLIC_TENANT_COOKIE, queryTenant, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)"],
};
