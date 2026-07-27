import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { ok, fail } from "@/lib/server/http";
import { scopeNullableBranchQuery } from "@/lib/server/branch-permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const query = scopeNullableBranchQuery(
    auth.supabase.from("admin_notifications").select("*").or(`admin_user_id.eq.${auth.context.id},admin_user_id.is.null`),
    auth.context,
    "branch_id"
  ).order("created_at", { ascending: false }).limit(100);
  const { data, error } = await query;
  if (error) return fail("Erro ao listar notificações.", 500, error.message);
  return ok({ notifications: data || [] });
}
