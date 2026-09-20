import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/server/auth";
import { fail, ok, readJson } from "@/lib/server/http";

const schema = z.object({
  kind: z.enum(["afd_preview", "aej_preview"]),
  startDate: z.string().date(),
  endDate: z.string().date(),
  branchId: z.string().uuid().optional(),
  idempotencyKey: z.string().trim().min(12).max(180).optional(),
}).refine((value) => value.endDate >= value.startDate, {
  message: "A data final deve ser igual ou posterior à inicial.",
});

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  if (!auth.context.permissions.includes("reports.export")) {
    return fail("A operação exige a permissão reports.export.", 403, { code: "FORBIDDEN" });
  }
  const { data, error } = await auth.supabase
    .from("background_jobs")
    .select("id,job_type,status,progress,result,error_code,error_message,created_at,completed_at")
    .eq("job_type", "regulatory_export_preview")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return fail("Erro ao consultar exportações.", 500, error.message);
  return ok({ jobs: data || [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  if (!auth.context.permissions.includes("reports.export")) {
    return fail("A operação exige a permissão reports.export.", 403, { code: "FORBIDDEN" });
  }
  const parsed = schema.safeParse(await readJson<unknown>(request));
  if (!parsed.success) return fail("Revise os parâmetros da exportação.", 422, parsed.error.flatten());
  const input = parsed.data;
  const idempotencyKey =
    input.idempotencyKey ||
    `${input.kind}:${input.startDate}:${input.endDate}:${input.branchId || "all"}:${randomUUID()}`;
  const { data, error } = await auth.supabase
    .from("background_jobs")
    .upsert({
      job_type: "regulatory_export_preview",
      idempotency_key: idempotencyKey,
      payload: {
        kind: input.kind,
        startDate: input.startDate,
        endDate: input.endDate,
        branchId: input.branchId || null,
      },
      status: "queued",
      created_by: auth.context.userId,
    }, { onConflict: "tenant_id,idempotency_key", ignoreDuplicates: true })
    .select("id,status,progress,created_at")
    .single();
  if (error) return fail("Erro ao enfileirar exportação.", 500, error.message);
  return ok({
    job: data,
    complianceStatus: "prévia técnica; CAdES e aderência legal dependem de validação externa",
  }, { status: 202 });
}
