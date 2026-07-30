import { NextRequest } from "next/server";
import { z } from "zod";
import { authenticatedUser } from "@/lib/server/auth";
import { getSupabaseAdmin } from "@/lib/server/db";
import { fail, ok } from "@/lib/server/http";
import { setTenantCookie } from "@/lib/server/tenant-context";

const schema = z.object({ tenantId: z.string().uuid() });

export async function POST(request: NextRequest) {
  const auth = await authenticatedUser(request);
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Empresa inválida.", 422);
  const supabase = getSupabaseAdmin();
  const { data: membership, error } = await supabase
    .from("tenant_memberships")
    .select("id,tenant_id,active,tenants!inner(id,slug,display_name,status)")
    .eq("auth_user_id", auth.user.id)
    .eq("tenant_id", parsed.data.tenantId)
    .eq("active", true)
    .maybeSingle();
  if (error) return fail("Erro ao selecionar empresa.", 500, error.message);
  const tenant = Array.isArray(membership?.tenants) ? membership?.tenants[0] : membership?.tenants;
  if (!membership || !tenant || ["suspended", "cancelled", "archived"].includes(tenant.status)) {
    return fail("Você não possui acesso ativo a esta empresa.", 403);
  }

  const response = ok({ selected: { id: membership.tenant_id, slug: tenant.slug, name: tenant.display_name } });
  setTenantCookie(response, membership.tenant_id, auth.user.id);
  await supabase.from("platform_audit_logs").insert({
    actor_user_id: auth.user.id,
    tenant_id: membership.tenant_id,
    action: "tenant_context_selected",
    resource_type: "tenant",
    resource_id: membership.tenant_id,
    request_id: request.headers.get("x-request-id") || crypto.randomUUID(),
    metadata: { slug: tenant.slug },
  });
  return response;
}
