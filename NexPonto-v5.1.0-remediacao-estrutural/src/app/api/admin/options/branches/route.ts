import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { scopeByBranch } from "@/lib/server/branch-permissions";
import { fail, ok } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const status = request.nextUrl.searchParams.get("status");
  const activeOnly = status !== "all" && status !== "inactive";
  const baseSelect = "id, name, code, active";

  let query = scopeByBranch(
    auth.supabase.from("branches").select(baseSelect).order("name"),
    auth.context,
    "id"
  );

  if (status === "inactive") query = query.eq("active", false);
  if (activeOnly) query = query.eq("active", true);

  const result = await query;
  let data = result.data;
  if (result.error) return fail("Erro ao carregar filiais leves.", 500, result.error.message);

  // Em instalações antigas, unidades podem existir sem active=true. O fallback
  // permite que um master as encontre e regularize pelo painel.
  if (activeOnly && (!data || data.length === 0)) {
    const fallbackQuery = scopeByBranch(
      auth.supabase.from("branches").select(baseSelect).order("name"),
      auth.context,
      "id"
    );
    const fallback = await fallbackQuery;
    if (fallback.error) return fail("Erro ao carregar filiais.", 500, fallback.error.message);
    data = fallback.data || [];
  }

  const branches = (data || []).sort((a: any, b: any) =>
    String(a.name).localeCompare(String(b.name), "pt-BR"),
  );

  if (!branches.length) {
    return fail(
      "Nenhuma filial foi cadastrada. Cadastre a primeira unidade no painel de Filiais.",
      409,
      "BRANCHES_NOT_CONFIGURED",
    );
  }

  return ok({ branches });
}
