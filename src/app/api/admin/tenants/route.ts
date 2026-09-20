import { NextRequest } from "next/server";
import { authenticatedUser } from "@/lib/server/auth";
import { getSupabaseAdmin } from "@/lib/server/db";
import { ok, fail } from "@/lib/server/http";
import { requestedTenantId } from "@/lib/server/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await authenticatedUser(request);
  if ("error" in auth) return auth.error;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tenant_memberships")
    .select("id,tenant_id,role,permissions,active,tenants!inner(id,slug,display_name,status,onboarding_status)")
    .eq("auth_user_id", auth.user.id)
    .eq("active", true)
    .order("created_at", { ascending: true });
  if (error) return fail("Erro ao carregar empresas disponíveis.", 500, error.message);
  const selectedTenantId = requestedTenantId(request, auth.user.id);
  return ok({
    selectedTenantId,
    tenants: (data || []).map((membership) => {
      const tenant = Array.isArray(membership.tenants) ? membership.tenants[0] : membership.tenants;
      return {
        membershipId: membership.id,
        id: membership.tenant_id,
        slug: tenant?.slug,
        name: tenant?.display_name,
        status: tenant?.status,
        onboardingStatus: tenant?.onboarding_status,
        role: membership.role,
        selected: membership.tenant_id === selectedTenantId,
      };
    }),
  });
}
