import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Liveness não consulta dependências e não expõe métricas operacionais. */
export async function GET() {
  return NextResponse.json(
    { status: "alive", timestamp: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
