import crypto from "crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { calculateDistanceMeters } from "@/lib/calculations";
import { fail, ok } from "@/lib/server/http";
import { requirePublicTenant } from "@/lib/server/public-tenant";
import { consumeRateLimit, rateLimitBucket } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  token: z.string().min(20).max(300),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  accuracy_meters: z.coerce.number().int().min(0).max(10_000),
  device_info: z.string().max(800).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const { tenant, rawSupabase, supabase } = await requirePublicTenant(request);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Não foi possível validar a localização informada.", 422, parsed.error.flatten());
    const input = parsed.data;
    const rate = await consumeRateLimit({
      supabase: rawSupabase,
      bucket: rateLimitBucket(["gps-validation", tenant.id, request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip")]),
      limit: 8,
      windowSeconds: 300,
      blockSeconds: 600,
    });
    if (!rate.allowed) return fail(`Muitas tentativas. Tente novamente em ${rate.retryAfterSeconds}s.`, 429);

    const tokenHash = crypto.createHash("sha256").update(input.token).digest("hex");
    const { data: session, error: sessionError } = await supabase
      .from("gps_validation_sessions")
      .select("id,branch_id,status,expires_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (sessionError) return fail("Erro ao validar a sessão.", 500, sessionError.message);
    if (!session || session.status !== "issued") return fail("Sessão de validação inválida ou já utilizada.", 404);
    if (new Date(session.expires_at).getTime() <= Date.now()) return fail("A sessão de validação expirou.", 410);

    const { data: branch, error: branchError } = await supabase
      .from("branches")
      .select("id,name,latitude,longitude,allowed_radius_meters")
      .eq("id", session.branch_id)
      .maybeSingle();
    if (branchError || !branch) return fail("Filial não encontrada.", 404, branchError?.message);
    const distance = calculateDistanceMeters(input.latitude, input.longitude, Number(branch.latitude), Number(branch.longitude));

    const { data: validation, error } = await rawSupabase.rpc("validate_branch_gps_session_v4", {
      p_tenant_id: tenant.id,
      p_token_hash: tokenHash,
      p_latitude: input.latitude,
      p_longitude: input.longitude,
      p_accuracy_meters: input.accuracy_meters,
      p_distance_meters: Math.round(distance),
      p_device_info: input.device_info || request.headers.get("user-agent") || "unknown",
    });
    if (error) return fail("Não foi possível concluir a validação presencial.", 422, error.message);
    const status = Array.isArray(validation) ? validation[0]?.status : validation?.status;
    return ok({
      status,
      branch: { id: branch.id, name: branch.name, allowedRadiusMeters: branch.allowed_radius_meters },
      distanceMeters: Math.round(distance),
      accuracyMeters: input.accuracy_meters,
      confirmed: status === "validated",
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Erro ao validar GPS.", 500);
  }
}
