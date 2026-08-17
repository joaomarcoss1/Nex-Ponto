import { NextResponse } from "next/server";
import { validateServerEnvironment } from "@/lib/config/environment";
import { getSupabaseAdmin } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  const configuration = validateServerEnvironment();
  let database = false;
  let storage = false;
  if (configuration.ok) {
    try {
      const supabase = getSupabaseAdmin();
      const [databaseResult, storageResult] = await Promise.all([
        supabase.from("tenants").select("id", { head: true, count: "exact" }).limit(1),
        supabase.storage.listBuckets(),
      ]);
      database = !databaseResult.error;
      storage = !storageResult.error;
    } catch {
      database = false;
      storage = false;
    }
  }
  const ready = configuration.ok && database && storage;
  return NextResponse.json({
    status: ready ? "ready" : "not_ready",
    checks: { configuration: configuration.ok, database, storage },
    durationMs: Date.now() - started,
    timestamp: new Date().toISOString(),
  }, { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
