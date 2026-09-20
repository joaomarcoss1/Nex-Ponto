import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/server/http";
import { requirePublicTenant } from "@/lib/server/public-tenant";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const token = String(request.nextUrl.searchParams.get("token") || "").trim();
    if (!/^[A-Za-z0-9_-]{20,180}$/.test(token)) return fail("QR inválido.", 400);
    const { supabase } = await requirePublicTenant(request);
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const { data, error } = await supabase
      .from("branch_qr_tokens")
      .select("id,valid_until,active,revoked_at,branches!inner(id,name,active)")
      .eq("token_hash", tokenHash)
      .eq("active", true)
      .is("revoked_at", null)
      .maybeSingle();
    if (error) return fail("Erro ao validar QR.", 500, error.message);
    const branch = Array.isArray(data?.branches) ? data?.branches[0] : data?.branches;
    if (!data || !branch?.active) return fail("QR inativo ou filial indisponível.", 404);
    if (new Date(data.valid_until).getTime() < Date.now()) return fail("QR expirado.", 410);
    return ok({ branch: { id: branch.id, name: branch.name }, validUntil: data.valid_until });
  } catch (error) {
    return fail("Não foi possível validar o QR agora.", 503, error instanceof Error ? error.message : error);
  }
}
