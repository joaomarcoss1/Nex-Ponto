import crypto from "crypto";
import { NextRequest } from "next/server";
import QRCode from "qrcode";
import { z } from "zod";
import { requireAdmin } from "@/lib/server/auth";
import { assertCanAccessBranch, canManageBranches } from "@/lib/server/branch-permissions";
import { writeAuditLog } from "@/lib/server/audit";
import { fail, ok } from "@/lib/server/http";
import { createQrPdfBuffer, fileResponse } from "@/lib/server/exporters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const issueSchema = z.object({
  branch_id: z.string().uuid(),
  validity_hours: z.coerce.number().int().min(1).max(168).default(12),
  max_uses: z.coerce.number().int().positive().max(100_000).nullable().optional(),
  replay_window_seconds: z.coerce.number().int().min(5).max(300).default(30),
  format: z.enum(["json", "pdf"]).default("json"),
});

function createToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function tokenHash(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function clockUrl(request: NextRequest, tenantSlug: string, token: string) {
  const origin = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const url = new URL("/", origin);
  url.searchParams.set("tenant", tenantSlug);
  url.searchParams.set("qr", token);
  return url.toString();
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  if (!canManageBranches(auth.context)) return fail("Permissão insuficiente para gerar QR de filial.", 403);

  const parsed = issueSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Revise a validade e os limites do QR.", 422, parsed.error.flatten());
  const input = parsed.data;
  const branchCheck = assertCanAccessBranch(auth.context, input.branch_id);
  if (branchCheck) return branchCheck;

  const { data: branch, error: branchError } = await auth.supabase
    .from("branches")
    .select("id,name,address")
    .eq("id", input.branch_id)
    .maybeSingle();
  if (branchError) return fail("Erro ao validar filial.", 500, branchError.message);
  if (!branch) return fail("Filial não encontrada.", 404);

  const rawToken = createToken();
  const hash = tokenHash(rawToken);
  const validUntil = new Date(Date.now() + input.validity_hours * 60 * 60 * 1000).toISOString();

  const { data: previous } = await auth.supabase
    .from("branch_qr_tokens")
    .select("id,token_prefix,valid_until")
    .eq("branch_id", input.branch_id)
    .eq("active", true);

  const { error: revokeError } = await auth.supabase
    .from("branch_qr_tokens")
    .update({ active: false, revoked_at: new Date().toISOString(), revoked_by: auth.context.userId })
    .eq("branch_id", input.branch_id)
    .eq("active", true);
  if (revokeError) return fail("Erro ao rotacionar o QR anterior.", 500, revokeError.message);

  const { data: issued, error } = await auth.supabase
    .from("branch_qr_tokens")
    .insert({
      branch_id: input.branch_id,
      token: null,
      token_hash: hash,
      token_prefix: rawToken.slice(0, 8),
      valid_until: validUntil,
      active: true,
      created_by: auth.context.id,
      replay_window_seconds: input.replay_window_seconds,
      max_uses: input.max_uses ?? null,
      rotation_group: crypto.randomUUID(),
    })
    .select("id,branch_id,token_prefix,valid_until,active,created_at,max_uses,replay_window_seconds")
    .single();
  if (error) return fail("Erro ao gerar QR da filial.", 500, error.message);

  const url = clockUrl(request, auth.context.tenantSlug, rawToken);
  await writeAuditLog({
    supabase: auth.supabase,
    context: auth.context,
    headers: request.headers,
    action: "generate_branch_qr",
    entity: "branch_qr_tokens",
    entityId: issued.id,
    reason: "Rotação manual de QR da filial",
    oldData: previous || [],
    newData: {
      branch: branch.name,
      validUntil,
      maxUses: input.max_uses ?? null,
      replayWindowSeconds: input.replay_window_seconds,
      tokenPrefix: issued.token_prefix,
    },
  });

  if (input.format === "pdf") {
    const qrDataUrl = await QRCode.toDataURL(url, {
      width: 700,
      margin: 2,
      errorCorrectionLevel: "H",
      color: { dark: "#0A1F4D", light: "#FFFFFF" },
    });
    const qrPng = Buffer.from(qrDataUrl.split(",")[1], "base64");
    const { data: branding } = await auth.rawSupabase
      .from("tenant_branding")
      .select("app_name,primary_color,secondary_color,report_footer")
      .eq("tenant_id", auth.context.tenantId)
      .maybeSingle();
    const pdf = await createQrPdfBuffer({
      qrPng,
      branchName: branch.name,
      address: branch.address,
      validUntil,
      clockUrl: url,
      branding: branding || undefined,
    });
    return fileResponse(pdf, `qr-${branch.name}.pdf`, "application/pdf");
  }

  return ok({
    qr: issued,
    clock_url: url,
    security: {
      rawTokenReturnedOnce: true,
      storedAsHash: true,
      expiresAt: validUntil,
      previousRevoked: true,
    },
  });
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const branchId = request.nextUrl.searchParams.get("branchId");
  const branchCheck = assertCanAccessBranch(auth.context, branchId);
  if (branchCheck) return branchCheck;

  const { data: branch } = await auth.supabase
    .from("branches")
    .select("id,name,address")
    .eq("id", branchId)
    .maybeSingle();
  if (!branch) return fail("Filial não encontrada.", 404);

  const { data: qr, error } = await auth.supabase
    .from("branch_qr_tokens")
    .select("id,branch_id,token_prefix,valid_until,active,created_at,last_used_at,use_count,max_uses,replay_window_seconds,revoked_at")
    .eq("branch_id", branchId)
    .eq("active", true)
    .gt("valid_until", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return fail("Erro ao consultar QR ativo.", 500, error.message);
  return ok({ branch, qr, clock_url: null, raw_token_available: false });
}
