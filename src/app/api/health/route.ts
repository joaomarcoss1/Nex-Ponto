import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      service: "nexponto-web",
    },
    {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
