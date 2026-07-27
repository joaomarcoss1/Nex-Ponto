import type { NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import { fail } from "@/lib/server/http";
import { getSupabaseAdmin, getSupabaseAuthClient } from "@/lib/server/db";
import { createTenantScopedClient } from "@/lib/server/tenant-scoped-client";
import { requestedTenantId } from "@/lib/server/tenant-context";
import type { AdminRole } from "@/types/domain";

export type AdminContext = {
  id: string;
  membershipId: string;
  userId: string;
  email: string;
  name: string;
  role: AdminRole;
  branchId: string | null;
  allowedBranchIds: string[];
  canViewFinancialData: boolean;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  permissions: string[];
  isPlatformSuperadmin: boolean;
};

type TenantRelation = {
  id: string;
  slug: string;
  display_name: string;
  status: "trial" | "active" | "suspended" | "cancelled" | "draft" | "onboarding" | "pending_validation" | "archived";
};

type MembershipRow = {
  id: string;
  tenant_id: string;
  admin_user_id: string | null;
  role: AdminRole;
  permissions: string[] | null;
  branch_ids: string[] | null;
  active: boolean;
  tenants: TenantRelation | TenantRelation[];
};

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] || null : value;
}

type AuthenticatedUserResult =
  | {
      readonly ok: false;
      readonly error: ReturnType<typeof fail>;
    }
  | {
      readonly ok: true;
      readonly token: string;
      readonly user: User;
    };
export async function authenticatedUser(request: NextRequest): Promise<AuthenticatedUserResult> {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  if (!token) return { ok: false, error: fail("Login administrativo obrigatório.", 401) } as const;

  const authClient = getSupabaseAuthClient();
  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userData.user?.email) {
    return { ok: false, error: fail("Sessão inválida ou expirada.", 401) } as const;
  }
  return { ok: true, token, user: userData.user } as const;
}

export async function requireAdmin(request: NextRequest, allowedRoles?: AdminRole[]) {
  const authResult = await authenticatedUser(request);
  if (!authResult.ok) return { error: authResult.error } as const;

  const rawSupabase = getSupabaseAdmin();
  const { data: membershipRows, error: membershipError } = await rawSupabase
    .from("tenant_memberships")
    .select("id,tenant_id,admin_user_id,role,permissions,branch_ids,active,tenants!inner(id,slug,display_name,status)")
    .eq("auth_user_id", authResult.user.id)
    .eq("active", true)
    .order("created_at", { ascending: true });

  if (membershipError) return { error: fail("Erro ao validar vínculo com a empresa.", 500, membershipError.message) };
  const memberships = (membershipRows || []) as MembershipRow[];
  if (!memberships.length) return { error: fail("Usuário sem vínculo ativo com uma empresa.", 403) };

  const cookieTenantId = requestedTenantId(request, authResult.user.id);
  const selectedMembership = cookieTenantId
    ? memberships.find((membership) => membership.tenant_id === cookieTenantId)
    : memberships.length === 1
      ? memberships[0]
      : null;

  if (!selectedMembership) {
    return {
      error: fail("Selecione a empresa que deseja administrar.", 409, {
        code: "TENANT_SELECTION_REQUIRED",
        tenants: memberships.map((membership) => {
          const tenant = relationOne(membership.tenants);
          return { id: membership.tenant_id, slug: tenant?.slug, name: tenant?.display_name };
        })
      })
    };
  }

  const tenant = relationOne(selectedMembership.tenants);
  if (!tenant || ["suspended", "cancelled", "archived"].includes(tenant.status)) {
    return { error: fail("Empresa suspensa ou indisponível.", 403) };
  }

  let profileQuery = rawSupabase
    .from("admin_users")
    .select("id,auth_user_id,email,full_name,role,active,branch_id,allowed_branch_ids,can_view_financial_data,tenant_id")
    .eq("tenant_id", selectedMembership.tenant_id);
  profileQuery = selectedMembership.admin_user_id
    ? profileQuery.eq("id", selectedMembership.admin_user_id)
    : profileQuery.eq("auth_user_id", authResult.user.id);
  const { data: profile, error: profileError } = await profileQuery.maybeSingle();

  if (profileError) return { error: fail("Erro ao validar permissões administrativas.", 500, profileError.message) };
  if (!profile?.active) return { error: fail("Usuário sem perfil administrativo ativo nesta empresa.", 403) };

  const effectiveRole = (selectedMembership.role || profile.role) as AdminRole;
  if (allowedRoles?.length && !allowedRoles.includes(effectiveRole)) {
    return { error: fail("Permissão insuficiente para esta ação.", 403) };
  }

  const { data: platformProfile } = await rawSupabase
    .from("platform_superadmins")
    .select("id")
    .eq("auth_user_id", authResult.user.id)
    .eq("active", true)
    .maybeSingle();

  const membershipBranches = Array.isArray(selectedMembership.branch_ids) ? selectedMembership.branch_ids : [];
  const profileBranches = Array.isArray(profile.allowed_branch_ids) ? profile.allowed_branch_ids : [];
  const allowedBranchIds = [...new Set([...membershipBranches, ...profileBranches])];
  const permissions = Array.isArray(selectedMembership.permissions) ? selectedMembership.permissions : [];

  const context: AdminContext = {
    id: profile.id,
    membershipId: selectedMembership.id,
    userId: authResult.user.id,
    email: authResult.user.email || profile.email,
    name: profile.full_name,
    role: effectiveRole,
    branchId: profile.branch_id || null,
    allowedBranchIds,
    canViewFinancialData: Boolean(profile.can_view_financial_data || permissions.includes("*") || permissions.includes("financial.view")),
    tenantId: selectedMembership.tenant_id,
    tenantSlug: tenant.slug,
    tenantName: tenant.display_name,
    permissions,
    isPlatformSuperadmin: Boolean(platformProfile)
  };

  return {
    context,
    rawSupabase,
    supabase: createTenantScopedClient(rawSupabase, context.tenantId)
  };
}

export async function requirePlatformSuperadmin(request: NextRequest) {
  const authResult = await authenticatedUser(request);
  if (!authResult.ok) return { error: authResult.error } as const;
  const supabase = getSupabaseAdmin();
  const { data: profile, error } = await supabase
    .from("platform_superadmins")
    .select("id,auth_user_id,email,full_name,active,mfa_required")
    .eq("auth_user_id", authResult.user.id)
    .eq("active", true)
    .maybeSingle();
  if (error) return { error: fail("Erro ao validar administração da plataforma.", 500, error.message) };
  if (!profile) return { error: fail("Acesso restrito à administração da plataforma.", 403) };
  return { context: profile, supabase, user: authResult.user };
}
