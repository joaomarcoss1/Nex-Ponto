import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { scopeByBranch } from "@/lib/server/branch-permissions";
import { fail, ok } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  try {
    const params = request.nextUrl.searchParams;
    const q = (params.get("q") || "").trim();
    let query = scopeByBranch(
      auth.supabase.from("employees").select("id, full_name, registration_code, branch_id, role, sector, employment_type, payment_day, active, branches:branches!employees_branch_id_fkey(name)").eq("active", true).order("full_name").limit(80),
      auth.context,
      "branch_id"
    );
    if (q.length >= 2) query = query.or(`full_name.ilike.%${q}%,registration_code.ilike.%${q}%`);
    const { data, error } = await query;
    if (error) return fail("Erro ao carregar funcionários leves.", 500, error.message);
    return ok({
      employees: (data || []).map((employee: any) => ({
        id: employee.id,
        full_name: employee.full_name,
        registration_code: employee.registration_code,
        branch_id: employee.branch_id,
        branch_name: employee.branches?.name || "-",
        role: employee.role,
        sector: employee.sector,
        employment_type: employee.employment_type,
        payment_day: employee.payment_day,
        active: employee.active
      }))
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Erro ao carregar funcionários leves.", 500);
  }
}
