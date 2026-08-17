import { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/server/db";
import { fail, ok } from "@/lib/server/http";
import {
  createRegulatoryPreview,
  type RegulatoryExportEntry,
  type RegulatoryExportKind,
} from "@/lib/services/regulatory-exports";
import { structuredLog } from "@/lib/observability/logger";
import { fetchAllPaginated } from "@/lib/server/pagination";

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

export async function POST(request: NextRequest) {
  if (!authorized(request)) return fail("Não autorizado.", 401, { code: "UNAUTHORIZED" });
  const supabase = getSupabaseAdmin();
  const { data: claimed, error: claimError } = await supabase.rpc("claim_background_job_v53", {
    p_worker_id: process.env.JOB_WORKER_ID || "nexponto-api-worker",
    p_job_types: ["regulatory_export_preview"],
  });
  if (claimError) return fail("Erro ao reservar trabalho.", 500, claimError.message);
  const job = Array.isArray(claimed) ? claimed[0] : claimed;
  if (!job) return ok({ processed: false });

  try {
    const payload = job.payload as {
      kind: RegulatoryExportKind;
      startDate: string;
      endDate: string;
      branchId?: string | null;
    };
    let query = supabase
      .from("time_entries")
      .select("nsr,employee_id,branch_id,action,entry_timestamp,regulatory_hash")
      .eq("tenant_id", job.tenant_id)
      .gte("entry_date", payload.startDate)
      .lte("entry_date", payload.endDate)
      .order("nsr");
    if (payload.branchId) query = query.eq("branch_id", payload.branchId);
    query = query.order("id");
    const entriesResult = await fetchAllPaginated<RegulatoryExportEntry>(query, { maxRows: 100_000 });
    if (entriesResult.truncated) throw new Error("Exportação regulatória excedeu 100.000 marcações. Divida o período ou filial.");
    const generated = createRegulatoryPreview(
      payload.kind,
      job.tenant_id,
      entriesResult.rows,
    );
    const objectPath = `${job.tenant_id}/regulatory/${job.id}-${payload.kind}.txt`;
    const { error: storageError } = await supabase.storage
      .from(process.env.EXPORTS_BUCKET || "exports")
      .upload(objectPath, Buffer.from(generated.content, "utf8"), {
        contentType: "text/plain; charset=utf-8",
        upsert: false,
      });
    if (storageError) throw new Error(storageError.message);
    await supabase.from("background_jobs").update({
      status: "completed",
      progress: 100,
      completed_at: new Date().toISOString(),
      result: {
        objectPath,
        checksum: generated.checksum,
        rowCount: generated.rowCount,
        complianceStatus: generated.complianceStatus,
      },
      lease_expires_at: null,
    }).eq("id", job.id);
    structuredLog("info", "background_job_completed", {
      jobId: job.id,
      tenantId: job.tenant_id,
      jobType: job.job_type,
      attempts: job.attempts,
    });
    return ok({ processed: true, jobId: job.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha no trabalho.";
    await supabase.rpc("fail_background_job_v53", {
      p_job_id: job.id,
      p_error_code: "REGULATORY_EXPORT_FAILED",
      p_error_message: message,
    });
    structuredLog("error", "background_job_failed", {
      jobId: job.id,
      tenantId: job.tenant_id,
      jobType: job.job_type,
      attempts: job.attempts,
      error: message,
    });
    return fail("O trabalho falhou e seguirá a política de retentativa.", 500, {
      code: "INTERNAL_ERROR",
      jobId: job.id,
    });
  }
}
