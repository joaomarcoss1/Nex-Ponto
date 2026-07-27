import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { fail, ok } from "@/lib/server/http";


export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request, ["master_admin"]);
  if ("error" in auth) return auth.error;
  const entity = request.nextUrl.searchParams.get("entity");
  const q = request.nextUrl.searchParams.get("q");
  let query = auth.supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(300);
  if (entity) query = query.eq("entity", entity);
  if (q) query = query.or(`action.ilike.%${q}%,user_email.ilike.%${q}%`);
  const { data, error } = await query;
  if (error) return fail("Erro ao listar auditoria.", 500, error.message);
  return ok({ logs: data || [] });
}
