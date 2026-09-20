import { NextRequest, NextResponse } from "next/server";
import { requireSupabaseBrowserServerConfig } from "@/lib/config/environment";
import { structuredLog } from "@/lib/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  try {
    const config = requireSupabaseBrowserServerConfig({ requestOrigin: request.nextUrl.origin });
    return NextResponse.json({
      supabaseUrl: config.supabaseUrl,
      supabaseAnonKey: config.supabaseAnonKey,
      appUrl: config.appUrl,
      requestId,
    }, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
      },
    });
  } catch (cause) {
    const issues = cause instanceof Error && "issues" in cause
      ? (cause as Error & { issues?: unknown }).issues
      : [{ name: "runtime-config", reason: "invalid" }];
    structuredLog("error", "runtime_config_invalid", { requestId, issues });
    return NextResponse.json({
      ok: false,
      code: "RUNTIME_CONFIG_UNAVAILABLE",
      message: "Ambiente administrativo indisponível. Contate o suporte e informe o requestId.",
      requestId,
    }, {
      status: 503,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
      },
    });
  }
}
