import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { canManageAdmins, canManageBranches, canManagePayroll, canViewFinancialData, isMasterAdmin } from "@/lib/server/branch-permissions";
import { ok } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const canFinancial = canViewFinancialData(auth.context);
  const master = isMasterAdmin(auth.context);
  const { data: tenantAccess } = await auth.rawSupabase
    .from("tenants")
    .select("public_access_code")
    .eq("id", auth.context.tenantId)
    .maybeSingle();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const employeePortalUrl = tenantAccess?.public_access_code
    ? `${appUrl.replace(/\/$/, "")}/?empresa=${tenantAccess.public_access_code}`
    : null;
  return ok({
    admin: {
      id: auth.context.id,
      userId: auth.context.userId,
      email: auth.context.email,
      name: auth.context.name,
      role: auth.context.role,
      branchId: auth.context.branchId,
      allowedBranchIds: auth.context.allowedBranchIds,
      canViewFinancialData: auth.context.canViewFinancialData,
      is_master: master,
      can_view_financial: canFinancial,
      can_edit_financial: canFinancial,
      can_export_financial: canFinancial,
      can_manage_payroll: canManagePayroll(auth.context),
      can_reopen_payroll: master,
      can_manage_admins: canManageAdmins(auth.context),
      can_manage_branches: canManageBranches(auth.context),
      tenantId: auth.context.tenantId,
      tenantSlug: auth.context.tenantSlug,
      tenantName: auth.context.tenantName,
      membershipId: auth.context.membershipId,
      permissions: auth.context.permissions,
      isPlatformSuperadmin: auth.context.isPlatformSuperadmin,
      supportSession: auth.context.supportSessionId ? {
        id: auth.context.supportSessionId,
        reason: auth.context.supportReason,
        expiresAt: auth.context.supportExpiresAt,
      } : null,
      employeePortalUrl
    }
  });
}
