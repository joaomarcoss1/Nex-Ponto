import { NextRequest } from "next/server";
import { z } from "zod";
import { requirePublicTenant } from "@/lib/server/public-tenant";
import { fail, ok } from "@/lib/server/http";
import {
  createDeviceIdentity,
  readDeviceIdentity,
  setDeviceIdentityCookie,
  type DevicePolicyMode,
} from "@/lib/security/device-identity";
import { getSystemSettings } from "@/lib/server/settings";
import { getClientIp } from "@/lib/server/pin";
import { consumeRateLimit, rateLimitBucket } from "@/lib/server/rate-limit";

const schema = z.object({
  employeeId: z.string().uuid().nullable().optional(),
  branchId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(2).max(120).default("Navegador do funcionário"),
  platform: z.string().trim().max(120).optional(),
  browser: z.string().trim().max(200).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return fail("Dados do dispositivo inválidos.", 422, parsed.error.flatten());
    const { supabase, tenant } = await requirePublicTenant(request);
    const clientIp = getClientIp(request.headers);
    const bootstrapRate = await consumeRateLimit({
      supabase,
      bucket: rateLimitBucket([tenant.id, "public-device-bootstrap", clientIp]),
      limit: 20,
      windowSeconds: 300,
      blockSeconds: 900,
    });
    if (!bootstrapRate.allowed) return fail(`Muitas tentativas de dispositivo. Tente novamente em ${bootstrapRate.retryAfterSeconds}s.`, 429);
    const existingIdentity = readDeviceIdentity(request);
    const createdIdentity = existingIdentity ? null : createDeviceIdentity();
    const keyHash = existingIdentity?.keyHash || createdIdentity?.keyHash;
    if (!keyHash) return fail("Não foi possível identificar o dispositivo.", 500);
    const rate = await consumeRateLimit({
      supabase,
      bucket: rateLimitBucket([tenant.id, "public-device", clientIp, keyHash]),
      limit: 12,
      windowSeconds: 300,
      blockSeconds: 600,
    });
    if (!rate.allowed) return fail(`Muitas tentativas de dispositivo. Tente novamente em ${rate.retryAfterSeconds}s.`, 429);
    const now = new Date().toISOString();
    const { data: existing } = await supabase
      .from("authorized_devices")
      .select("id,status,trust_level,employee_id,branch_id")
      .eq("device_key_hash", keyHash)
      .maybeSingle();
    const payload = {
      device_key_hash: keyHash,
      display_name: parsed.data.name,
      platform: parsed.data.platform || null,
      browser: parsed.data.browser || request.headers.get("user-agent")?.slice(0, 200) || null,
      employee_id: existing?.employee_id || parsed.data.employeeId || null,
      branch_id: existing?.branch_id || parsed.data.branchId || null,
      first_used_at: existing ? undefined : now,
      last_used_at: now,
      status: existing?.status || "pending",
      trust_level: existing?.trust_level || "unverified",
    };
    const { data, error } = await supabase
      .from("authorized_devices")
      .upsert(payload, { onConflict: "tenant_id,device_key_hash" })
      .select("id,status,trust_level,employee_id,branch_id,last_used_at")
      .single();
    if (error) return fail("Não foi possível registrar o dispositivo.", 500, error.message);
    const settings = await getSystemSettings(supabase);
    const mode = String((settings as Record<string, unknown>).authorized_device_mode || "monitored") as DevicePolicyMode;
    const response = ok({ device: data, mode });
    if (createdIdentity) setDeviceIdentityCookie(response, createdIdentity.cookieValue);
    return response;
  } catch (error) {
    return fail("Não foi possível identificar o dispositivo agora.", 503, error instanceof Error ? error.message : error);
  }
}
