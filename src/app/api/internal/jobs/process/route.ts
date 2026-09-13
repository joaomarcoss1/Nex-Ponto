import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/db";
import { fail, ok } from "@/lib/server/http";
import {
  createRegulatoryPreview,
  type RegulatoryExportEntry,
  type RegulatoryExportKind,
} from "@/lib/services/regulatory-exports";
import { structuredLog } from "@/lib/observability/logger";
import { isAuthorizedInternalJob } from "@/lib/server/internal-job-auth";
import { fetchAllRows } from "@/lib/server/pagination";
import { requireJobsConfig } from "@/lib/config/environment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function startLeaseHeartbeat(heartbeat: () => Promise<{ error: { message: string } | null }>) {
  let stopped = false;
  let failure: Error | null = null;
  let inFlight: Promise<void> = Promise.resolve();

  const pulse = async () => {
    if (stopped) return;
    inFlight = inFlight.then(async () => {
      if (stopped || failure) return;
      const result = await heartbeat();
      if (result.error) failure = new Error(`JOB_HEARTBEAT_FAILED:${result.error.message}`);
    }).catch((cause) => {
      failure = cause instanceof Error ? cause : new Error("JOB_HEARTBEAT_FAILED");
    });
    await inFlight;
    if (failure) throw failure;
  };

  const timer = setInterval(() => {
    void pulse().catch(() => undefined);
  }, 60_000);
  timer.unref?.();

  return {
    pulse,
    async stop(throwOnFailure = true) {
      stopped = true;
      clearInterval(timer);
      await inFlight;
      if (throwOnFailure && failure) throw failure;
    },
  };
}

async function processOne(request: NextRequest) {
  try {
    requireJobsConfig();
  } catch (cause) {
    structuredLog("error", "jobs_configuration_unavailable", {
      issues: cause instanceof Error && "issues" in cause ? (cause as Error & { issues?: unknown }).issues : [],
    });
    return fail("Configuração de jobs indisponível.", 503, { code: "ENVIRONMENT_NOT_READY" });
  }
  if (!isAuthorizedInternalJob(request)) return fail("Não autorizado.", 401, { code: "UNAUTHORIZED" });
  const supabase = getSupabaseAdmin();
  const workerId = process.env.JOB_WORKER_ID || "nexponto-api-worker";
  const { data: claimed, error: claimError } = await supabase.rpc("claim_background_job_v556", {
    p_worker_id: workerId,
    p_job_types: ["regulatory_export_preview"],
  });
  if (claimError) return fail("Erro ao reservar trabalho.", 500, claimError.message);
  const job = Array.isArray(claimed) ? claimed[0] : claimed;
  if (!job) return ok({ processed: false });
  const leaseToken = typeof job.lease_token === "string" ? job.lease_token : null;
  if (!leaseToken) {
    structuredLog("error", "background_job_missing_lease_token", { jobId: job.id, jobType: job.job_type });
    return fail("Trabalho reservado sem lease token.", 500, { code: "JOB_LEASE_TOKEN_MISSING", jobId: job.id });
  }

  const heartbeat = async () => supabase.rpc("heartbeat_background_job_v556", {
    p_job_id: job.id,
    p_worker_id: workerId,
    p_lease_token: leaseToken,
  });
  const leaseHeartbeat = startLeaseHeartbeat(heartbeat);

  try {
    const payload = job.payload as {
      kind: RegulatoryExportKind;
      startDate: string;
      endDate: string;
      branchId?: string | null;
    };
    await leaseHeartbeat.pulse();
    let query = supabase.from("time_entries").select("id,nsr,employee_id,branch_id,action,entry_timestamp,regulatory_hash").eq("tenant_id", job.tenant_id).gte("entry_date", payload.startDate).lte("entry_date", payload.endDate).order("nsr").order("id");
    if (payload.branchId) query = query.eq("branch_id", payload.branchId);
    const entries = await fetchAllRows<RegulatoryExportEntry>((from, to) => query.range(from, to), { maxRows: 1_000_000 });
    await leaseHeartbeat.pulse();
    const generated = createRegulatoryPreview(
      payload.kind,
      job.tenant_id,
      entries,
    );
    const objectPath = `${job.tenant_id}/regulatory/${job.id}-${payload.kind}.txt`;
    const { error: storageError } = await supabase.storage
      .from(process.env.EXPORTS_BUCKET || "exports")
      .upload(objectPath, Buffer.from(generated.content, "utf8"), {
        contentType: "text/plain",
        upsert: false,
      });
    if (storageError) throw new Error(storageError.message);
    await leaseHeartbeat.stop();
    const completion = await supabase.rpc("complete_background_job_v556", {
      p_job_id: job.id,
      p_worker_id: workerId,
      p_lease_token: leaseToken,
      p_result: {
        objectPath,
        checksum: generated.checksum,
        rowCount: generated.rowCount,
        complianceStatus: generated.complianceStatus,
      },
    });
    if (completion.error) throw new Error(`JOB_COMPLETION_FAILED:${completion.error.message}`);
    structuredLog("info", "background_job_completed", {
      jobId: job.id,
      tenantId: job.tenant_id,
      jobType: job.job_type,
      attempts: job.attempts,
    });
    return ok({ processed: true, jobId: job.id });
  } catch (error) {
    await leaseHeartbeat.stop(false);
    const message = error instanceof Error ? error.message : "Falha no trabalho.";
    const failure = await supabase.rpc("fail_background_job_v556", {
      p_job_id: job.id,
      p_worker_id: workerId,
      p_lease_token: leaseToken,
      p_error_code: "REGULATORY_EXPORT_FAILED",
      p_error_message: message,
    });
    if (failure.error) {
      structuredLog("error", "background_job_failure_transition_failed", {
        jobId: job.id,
        tenantId: job.tenant_id,
        jobType: job.job_type,
        error: failure.error.message,
      });
      return fail("O trabalho falhou e seu estado não pôde ser reconciliado.", 500, {
        code: "JOB_FAILURE_TRANSITION_FAILED",
        jobId: job.id,
      });
    }
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

export async function POST(request: NextRequest) { return processOne(request); }
export async function GET(request: NextRequest) { return processOne(request); }
