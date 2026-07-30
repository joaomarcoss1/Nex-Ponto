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

type AttachmentScanPayload = {
  bucket: string;
  path: string;
  justificationId: string;
  sha256?: string | null;
  mime?: string | null;
};

function attachmentScanPayload(value: unknown): AttachmentScanPayload {
  const payload = value as Partial<AttachmentScanPayload>;
  if (!payload.bucket || !payload.path || !payload.justificationId) {
    throw new Error("ATTACHMENT_SCAN_PAYLOAD_INVALID");
  }
  return {
    bucket: payload.bucket,
    path: payload.path,
    justificationId: payload.justificationId,
    sha256: payload.sha256 || null,
    mime: payload.mime || null,
  };
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return fail("Não autorizado.", 401, { code: "UNAUTHORIZED" });
  const supabase = getSupabaseAdmin();
  const { data: claimed, error: claimError } = await supabase.rpc("claim_background_job_v53", {
    p_worker_id: process.env.JOB_WORKER_ID || "nexponto-api-worker",
    p_job_types: ["regulatory_export_preview", "attachment_scan"],
  });
  if (claimError) return fail("Erro ao reservar trabalho.", 500, claimError.message);
  const job = Array.isArray(claimed) ? claimed[0] : claimed;
  if (!job) return ok({ processed: false });

  try {
    if (job.job_type === "attachment_scan") {
      const payload = attachmentScanPayload(job.payload);
      const scannerMode = process.env.MALWARE_SCANNER_MODE || "external_required";
      if (scannerMode !== "metadata_only") {
        await supabase.from("absence_justifications").update({
          attachment_scan_status: "scan_failed",
          attachment_scan_result: {
            scanner: scannerMode,
            result: "scanner_not_configured",
            scannedAt: new Date().toISOString(),
          },
          attachment_scanned_at: new Date().toISOString(),
        }).eq("id", payload.justificationId).eq("tenant_id", job.tenant_id);
        throw new Error("MALWARE_SCANNER_NOT_CONFIGURED");
      }

      const { data: objects, error: objectError } = await supabase.storage.from(payload.bucket).list(
        payload.path.split("/").slice(0, -1).join("/"),
        { search: payload.path.split("/").at(-1), limit: 1 },
      );
      if (objectError) throw new Error(objectError.message);
      if (!objects?.length) throw new Error("ATTACHMENT_OBJECT_NOT_FOUND");

      await supabase.from("absence_justifications").update({
        attachment_scan_status: "clean",
        attachment_scan_result: {
          scanner: "metadata_only",
          result: "clean",
          sha256: payload.sha256,
          mime: payload.mime,
          scannedAt: new Date().toISOString(),
        },
        attachment_scanned_at: new Date().toISOString(),
      }).eq("id", payload.justificationId).eq("tenant_id", job.tenant_id);
      await supabase.from("background_jobs").update({
        status: "completed",
        progress: 100,
        completed_at: new Date().toISOString(),
        result: { scanner: "metadata_only", attachmentId: payload.justificationId },
        lease_expires_at: null,
      }).eq("id", job.id);
      structuredLog("info", "attachment_scan_completed", {
        jobId: job.id,
        tenantId: job.tenant_id,
        scanner: "metadata_only",
      });
      return ok({ processed: true, jobId: job.id });
    }

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
    const { data: entries, error: entriesError } = await query;
    if (entriesError) throw new Error(entriesError.message);
    const generated = createRegulatoryPreview(
      payload.kind,
      job.tenant_id,
      (entries || []) as RegulatoryExportEntry[],
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
