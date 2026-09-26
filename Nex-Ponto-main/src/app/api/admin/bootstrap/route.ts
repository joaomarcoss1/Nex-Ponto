import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { canViewFinancialData, scopeByBranch, scopeNullableBranchQuery } from "@/lib/server/branch-permissions";
import { fail, ok } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  try {
    const [branchesRes, employeesRes, notificationsRes] = await Promise.all([
      scopeByBranch(auth.supabase.from("branches").select("id,name,type,active,gps_ready,geolocation_status,allowed_radius_meters").eq("active", true).order("name"), auth.context, "id"),
      scopeByBranch(auth.supabase.from("employees").select("id,full_name,registration_code,branch_id,role,sector,active").eq("active", true).order("full_name").limit(120), auth.context, "branch_id"),
      scopeNullableBranchQuery(
        auth.supabase.from("admin_notifications").select("id,title,message,notification_type,read_at,created_at,branch_id").is("read_at", null),
        auth.context,
        "branch_id"
      ).order("created_at", { ascending: false }).limit(8)
    ]);

    if (branchesRes.error) throw new Error(branchesRes.error.message);
    if (employeesRes.error) throw new Error(employeesRes.error.message);
    if (notificationsRes.error) throw new Error(notificationsRes.error.message);

    return ok({
      profile: {
        id: auth.context.id,
        userId: auth.context.userId,
        email: auth.context.email,
        role: auth.context.role,
        canViewFinancialData: canViewFinancialData(auth.context),
        allowedBranches: auth.context.allowedBranchIds
      },
      branches: branchesRes.data || [],
      employees: employeesRes.data || [],
      notifications: notificationsRes.data || [],
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Erro ao carregar bootstrap administrativo.", 500);
  }
}
