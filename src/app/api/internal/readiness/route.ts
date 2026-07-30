import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: NextRequest) {
  const expected = process.env.INTERNAL_JOBS_SECRET || "";
  const received = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return expected.length >= 32 &&
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ status: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const started = Date.now();
  try {
    const supabase = getSupabaseAdmin();
    const [database, storage, deadLetters, staleJobs] = await Promise.all([
      supabase.from("tenants").select("id", { head: true, count: "exact" }).limit(1),
      supabase.storage.listBuckets(),
      supabase.from("background_jobs").select("id", { head: true, count: "exact" }).eq("status", "dead_letter"),
      supabase.from("background_jobs").select("id", { head: true, count: "exact" }).eq("status", "running").lt("lease_expires_at", new Date().toISOString()),
    ]);
    const checks = {
      database: !database.error,
      storage: !storage.error,
      deadLetterJobs: deadLetters.count || 0,
      staleRunningJobs: staleJobs.count || 0,
    };
    const ready = checks.database && checks.storage;
    return NextResponse.json(
      {
        status: ready ? "ready" : "degraded",
        checks,
        durationMs: Date.now() - started,
        timestamp: new Date().toISOString(),
      },
      { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      {
        status: "unready",
        checks: { database: false, storage: false },
        durationMs: Date.now() - started,
        timestamp: new Date().toISOString(),
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
