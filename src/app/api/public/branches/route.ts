import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/server/http";
import { requirePublicTenant } from "@/lib/server/public-tenant";

export async function GET(request: NextRequest) {
  try {
    const { supabase, tenant } = await requirePublicTenant(request);
    const { data, error } = await supabase
      .from("branches")
      .select("id,name,type,allowed_radius_meters,timezone,geolocation_status,gps_ready")
      .eq("active", true)
      .order("name", { ascending: true });
    if (error) return fail("Erro ao listar filiais.", 500, error.message);
    return ok({ tenant: { slug: tenant.slug, name: tenant.displayName }, branches: data || [] });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Erro inesperado.", 500);
  }
}
