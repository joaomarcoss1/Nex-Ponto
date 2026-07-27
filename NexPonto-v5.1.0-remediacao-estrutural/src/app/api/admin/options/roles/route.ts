import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { scopeByBranch } from "@/lib/server/branch-permissions";
import { fail, ok } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const { data, error } = await scopeByBranch(auth.supabase.from("employees").select("role").eq("active", true), auth.context, "branch_id");
  if (error) return fail("Erro ao carregar cargos.", 500, error.message);
  const map = new Map<string, number>();
  (data || []).forEach((row: any) => {
    const key = row.role || "Sem cargo";
    map.set(key, (map.get(key) || 0) + 1);
  });
  return ok({ roles: Array.from(map.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name)) });
}
