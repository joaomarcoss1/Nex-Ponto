import type { NextRequest } from "next/server";
import type { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fail } from "@/lib/server/http";
import { getSupabaseAdmin, getSupabaseAuthClient } from "@/lib/server/db";
import { createTenantScopedClient } from "@/lib/server/tenant-scoped-client";
import { requestedTenantId } from "@/lib/server/tenant-context";
import type { AdminRole } from "@/types/domain";
import {
  canonicalRole,
  hasPermission,
  legacyRoleRequirement,
  PERMISSIONS,
  resolvePermissions,
  type PermissionRequirement,
  type Permission,
} from "@/lib/security/authorization";
import { resolveActiveSupportSession } from "@/lib/server/support-session";
import { permissionsForSupportScopes } from "@/lib/security/support-scopes";

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
  supportSessionId?: string;
  supportReason?: string;
  supportExpiresAt?: string;
};

type AuthFailure = { error: NextResponse };
type AuthenticatedUserSuccess = { token: string; user: User };
type AuthenticatedUserResult = AuthFailure | AuthenticatedUserSuccess;
export type AdminAuthSuccess = {
  context: AdminContext;
  rawSupabase: SupabaseClient;
  supabase: SupabaseClient;
  user: User;
};
export type AdminAuthResult = AuthFailure | AdminAuthSuccess;

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

const SUPPORT_ROUTE_PERMISSIONS: Array<[string, Permission]> = [
  ["/api/admin/me", "audit.view"],
  ["/api/admin/dashboard", "audit.view"],
  ["/api/admin/audit", "audit.view"],
  ["/api/admin/notifications", "audit.view"],
  ["/api/admin/payroll", "payroll.view"],
  ["/api/admin/reports", "reports.export"],
  ["/api/admin/regulatory-exports", "reports.export"],
  ["/api/admin/privacy-requests", "audit.view"],
  ["/api/admin/employees", "employee.manage"],
  ["/api/admin/options/employees", "employee.manage"],
  ["/api/admin/options/roles", "employee.manage"],
  ["/api/admin/options/sectors", "employee.manage"],
  ["/api/admin/branch-authorizations", "employee.manage"],
  ["/api/admin/branches", "branch.manage"],
  ["/api/admin/branch-hours", "branch.manage"],
  ["/api/admin/branch-qr", "branch.manage"],
  ["/api/admin/options/branches", "branch.manage"],
  ["/api/admin/schedules", "schedule.manage"],
  ["/api/admin/work-schedules", "schedule.manage"],
  ["/api/admin/holidays", "schedule.manage"],
  ["/api/admin/holiday-decisions", "schedule.manage"],
  ["/api/admin/shift-requests", "schedule.manage"],
  ["/api/admin/time-entries", "time_entry.review"],
  ["/api/admin/point-reviews", "time_entry.review"],
  ["/api/admin/inconsistencies", "time_entry.review"],
  ["/api/admin/justifications", "time_entry.review"],
  ["/api/admin/geo-report", "time_entry.review"],
  ["/api/admin/devices", "time_entry.review"],
  ["/api/admin/branding", "branding.manage"],
  ["/api/admin/overtime-reviews", "overtime.review"],
  ["/api/admin/hour-bank", "time_bank.manage"],
  ["/api/admin/settings", "tenant.manage"],
  ["/api/admin/onboarding", "tenant.manage"],
  ["/api/admin/bootstrap", "tenant.manage"],
  ["/api/admin/admins", "administrators.manage"],
  ["/api/admin/tenants", "tenant.manage"],
];

const ADMIN_WRITE_ROUTE_PERMISSIONS: Array<[string, Permission]> = [
  ["/api/admin/employees", "employee.manage"],
  ["/api/admin/branch-authorizations", "employee.manage"],
  ["/api/admin/branches", "branch.manage"],
  ["/api/admin/branch-hours", "branch.manage"],
  ["/api/admin/branch-qr", "branch.manage"],
  ["/api/admin/schedules", "schedule.manage"],
  ["/api/admin/work-schedules", "schedule.manage"],
  ["/api/admin/holidays", "schedule.manage"],
  ["/api/admin/holiday-decisions", "schedule.manage"],
  ["/api/admin/shift-requests", "schedule.manage"],
  ["/api/admin/time-entries", "time_entry.review"],
  ["/api/admin/point-reviews", "time_entry.review"],
  ["/api/admin/inconsistencies", "time_entry.review"],
  ["/api/admin/justifications", "time_entry.review"],
  ["/api/admin/devices", "time_entry.review"],
  ["/api/admin/overtime-reviews", "overtime.review"],
  ["/api/admin/hour-bank", "time_bank.manage"],
  ["/api/admin/payroll-items", "payroll.calculate"],
  ["/api/admin/payroll", "payroll.calculate"],
  ["/api/admin/reports", "reports.export"],
  ["/api/admin/regulatory-exports", "reports.export"],
  ["/api/admin/settings", "tenant.manage"],
  ["/api/admin/onboarding", "tenant.manage"],
  ["/api/admin/privacy-requests", "tenant.manage"],
  ["/api/admin/admins", "administrators.manage"],
  ["/api/admin/branding", "branding.manage"],
];

const ADMIN_READ_ROUTE_PERMISSIONS: Array<[string, Permission]> = [
  ["/api/admin/admins", "administrators.manage"],
  ["/api/admin/audit", "audit.view"],
  ["/api/admin/branch-authorizations", "employee.manage"],
  ["/api/admin/branches", "branch.manage"],
  ["/api/admin/devices", "time_entry.review"],
  ["/api/admin/employees/export", "employee.manage"],
  ["/api/admin/employees", "employee.manage"],
  ["/api/admin/geo-report", "time_entry.review"],
  ["/api/admin/holiday-decisions", "schedule.manage"],
  ["/api/admin/holidays", "schedule.manage"],
  ["/api/admin/hour-bank", "time_bank.manage"],
  ["/api/admin/inconsistencies", "time_entry.review"],
  ["/api/admin/justifications", "time_entry.review"],
  ["/api/admin/overtime-reviews", "overtime.review"],
  ["/api/admin/payroll", "payroll.view"],
  ["/api/admin/payroll-items", "payroll.view"],
  ["/api/admin/point-reviews", "time_entry.review"],
  ["/api/admin/privacy-requests", "tenant.manage"],
  ["/api/admin/regulatory-exports", "reports.export"],
  ["/api/admin/reports", "reports.export"],
  ["/api/admin/schedules", "schedule.manage"],
  ["/api/admin/settings", "tenant.manage"],
  ["/api/admin/shift-requests", "schedule.manage"],
  ["/api/admin/time-entries", "time_entry.review"],
  ["/api/admin/work-schedules", "schedule.manage"],
];

function supportRouteRequirement(request: NextRequest): PermissionRequirement | null {
  const match = SUPPORT_ROUTE_PERMISSIONS.find(([prefix]) =>
    request.nextUrl.pathname === prefix || request.nextUrl.pathname.startsWith(`${prefix}/`),
  );
  return match ? { all: [match[1]] } : null;
}

function adminWriteRouteRequirement(request: NextRequest): PermissionRequirement | null {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) return null;
  const match = ADMIN_WRITE_ROUTE_PERMISSIONS.find(([prefix]) =>
    request.nextUrl.pathname === prefix || request.nextUrl.pathname.startsWith(`${prefix}/`),
  );
  return match ? { all: [match[1]] } : null;
}

function adminReadRouteRequirement(request: NextRequest): PermissionRequirement | null {
  if (!["GET", "HEAD"].includes(request.method.toUpperCase())) return null;
  const match = ADMIN_READ_ROUTE_PERMISSIONS.find(([prefix]) =>
    request.nextUrl.pathname === prefix || request.nextUrl.pathname.startsWith(`${prefix}/`),
  );
  return match ? { all: [match[1]] } : null;
}

function sameUuidSet(left: readonly string[] | null | undefined, right: readonly string[] | null | undefined) {
  const normalize = (values: readonly string[] | null | undefined) =>
    [...new Set((values || []).filter(Boolean).map(String))].sort();
  const a = normalize(left);
  const b = normalize(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export async function authenticatedUser(request: NextRequest): Promise<AuthenticatedUserResult> {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  const requestId = request.headers.get("x-request-id") || undefined;
  if (!token) return { error: fail("Login administrativo obrigatório.", 401, { code: "AUTH_SESSION_REQUIRED", requestId }) } as const;

  try {
    const authClient = getSupabaseAuthClient();
    const { data: userData, error: userError } = await authClient.auth.getUser(token);
    if (userError || !userData.user?.email) {
      const authenticationFailure = !userError || userError.status === 400 || userError.status === 401 || userError.status === 403;
      return {
        error: fail(
          authenticationFailure ? "Sessão inválida ou expirada." : "Não foi possível consultar o provedor de autenticação.",
          authenticationFailure ? 401 : 503,
          { code: authenticationFailure ? "AUTH_SESSION_INVALID" : "AUTH_PROVIDER_UNAVAILABLE", requestId },
        ),
      } as const;
    }
    return { token, user: userData.user } as const;
  } catch (cause) {
    const code = cause instanceof Error && "code" in cause ? String((cause as Error & { code?: unknown }).code || "") : "";
    return {
      error: fail(
        code === "ENVIRONMENT_NOT_READY" ? "O ambiente administrativo está temporariamente indisponível." : "Não foi possível consultar o provedor de autenticação.",
        503,
        { code: code === "ENVIRONMENT_NOT_READY" ? "ENVIRONMENT_NOT_READY" : "AUTH_PROVIDER_UNAVAILABLE", requestId },
      ),
    } as const;
  }
}

async function requireAdminInternal(
  request: NextRequest,
  requirement?: AdminRole[] | PermissionRequirement,
): Promise<AdminAuthResult> {
  const authResult = await authenticatedUser(request);
  if ("error" in authResult) return authResult;

  const rawSupabase = getSupabaseAdmin();
  const { data: platformProfile } = await rawSupabase
    .from("platform_superadmins")
    .select("id,email,full_name")
    .eq("auth_user_id", authResult.user.id)
    .eq("active", true)
    .maybeSingle();
  const support = platformProfile
    ? await resolveActiveSupportSession(request, rawSupabase, authResult.user.id, platformProfile.id)
    : null;
  if (support && platformProfile) {
    const permissions = permissionsForSupportScopes(support.scope, [...PERMISSIONS]);
    const explicitRequirement = Array.isArray(requirement)
      ? legacyRoleRequirement(requirement)
      : requirement;
    const permissionRequirement = explicitRequirement || supportRouteRequirement(request);
    if (!permissionRequirement) {
      return { error: fail("Esta rota não está habilitada para sessões de suporte.", 403, { code: "PERMISSION_DENIED" }) };
    }
    if (permissionRequirement && !hasPermission(permissions, permissionRequirement)) {
      return { error: fail("A sessão de suporte não possui o escopo necessário.", 403) };
    }
    const context: AdminContext = {
      id: platformProfile.id,
      membershipId: "",
      userId: authResult.user.id,
      email: authResult.user.email || platformProfile.email,
      name: platformProfile.full_name,
      role: "platform_superadmin",
      branchId: null,
      allowedBranchIds: [],
      canViewFinancialData: true,
      tenantId: support.tenant_id,
      tenantSlug: support.tenant.slug,
      tenantName: support.tenant.display_name,
      permissions,
      isPlatformSuperadmin: true,
      supportSessionId: support.id,
      supportReason: support.reason,
      supportExpiresAt: support.expires_at,
    };
    return {
      context,
      rawSupabase,
      supabase: createTenantScopedClient(rawSupabase, context.tenantId),
      user: authResult.user,
    };
  }
  const { data: membershipRows, error: membershipError } = await rawSupabase
    .from("tenant_memberships")
    .select("id,tenant_id,admin_user_id,role,permissions,branch_ids,active,tenants!inner(id,slug,display_name,status)")
    .eq("auth_user_id", authResult.user.id)
    .eq("active", true)
    .order("created_at", { ascending: true });

  const requestId = request.headers.get("x-request-id") || undefined;
  if (membershipError) return { error: fail("Erro ao validar vínculo com a empresa.", 500, { code: "DATABASE_ERROR", requestId, technicalMessage: membershipError.message }) };
  const memberships = (membershipRows || []) as MembershipRow[];
  if (!memberships.length) return { error: fail("Usuário sem vínculo ativo com uma empresa.", 403, { code: "MEMBERSHIP_NOT_FOUND", requestId }) };

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
        requestId,
        tenants: memberships.map((membership) => {
          const tenant = relationOne(membership.tenants);
          return { id: membership.tenant_id, slug: tenant?.slug, name: tenant?.display_name };
        })
      })
    };
  }

  const tenant = relationOne(selectedMembership.tenants);
  if (!tenant || ["suspended", "cancelled", "archived"].includes(tenant.status)) {
    return { error: fail("Empresa suspensa ou indisponível.", 403, { code: "TENANT_INACTIVE", requestId }) };
  }

  let profileQuery = rawSupabase
    .from("admin_users")
    .select("id,auth_user_id,email,full_name,role,active,branch_id,allowed_branch_ids,can_view_financial_data,tenant_id")
    .eq("tenant_id", selectedMembership.tenant_id);
  profileQuery = selectedMembership.admin_user_id
    ? profileQuery.eq("id", selectedMembership.admin_user_id).eq("auth_user_id", authResult.user.id)
    : profileQuery.eq("auth_user_id", authResult.user.id);
  const { data: profile, error: profileError } = await profileQuery.maybeSingle();

  if (profileError) return { error: fail("Erro ao validar permissões administrativas.", 500, { code: "DATABASE_ERROR", requestId, technicalMessage: profileError.message }) };
  if (!profile) return { error: fail(
    selectedMembership.admin_user_id
      ? "O vínculo administrativo não corresponde à identidade autenticada."
      : "Perfil administrativo não encontrado nesta empresa.",
    403,
    { code: selectedMembership.admin_user_id ? "ADMIN_MEMBERSHIP_IDENTITY_MISMATCH" : "ADMIN_PROFILE_NOT_FOUND", requestId },
  ) };
  if (!profile.active) return { error: fail("Usuário sem perfil administrativo ativo nesta empresa.", 403, { code: "ADMIN_PROFILE_INACTIVE", requestId }) };
  if (profile.auth_user_id !== authResult.user.id || profile.tenant_id !== selectedMembership.tenant_id) {
    return { error: fail("O vínculo administrativo não corresponde à identidade autenticada.", 403, { code: "ADMIN_MEMBERSHIP_IDENTITY_MISMATCH", requestId }) };
  }

  if (selectedMembership.role !== profile.role) {
    return { error: fail("O perfil administrativo está divergente do vínculo da empresa.", 403, { code: "ADMIN_MEMBERSHIP_ROLE_MISMATCH", requestId }) };
  }
  const membershipBranches = Array.isArray(selectedMembership.branch_ids) ? selectedMembership.branch_ids : [];
  const profileBranches = Array.isArray(profile.allowed_branch_ids) ? profile.allowed_branch_ids : [];
  if (!sameUuidSet(membershipBranches, profileBranches)) {
    return { error: fail("O escopo de filiais do administrador está divergente do vínculo da empresa.", 403, { code: "ADMIN_MEMBERSHIP_BRANCH_MISMATCH", requestId }) };
  }

  const storedRole = selectedMembership.role as AdminRole;
  const effectiveRole = canonicalRole(storedRole);
  const permissions = resolvePermissions(storedRole, selectedMembership.permissions);
  const explicitPermissionRequirement = Array.isArray(requirement)
    ? legacyRoleRequirement(requirement)
    : requirement;
  const permissionRequirement = explicitPermissionRequirement || adminWriteRouteRequirement(request) || adminReadRouteRequirement(request);
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase()) && !permissionRequirement) {
    return { error: fail("A rota de escrita não possui uma política de autorização configurada.", 403, { code: "ROUTE_PERMISSION_NOT_CONFIGURED", requestId }) };
  }
  if (permissionRequirement && !hasPermission(permissions, permissionRequirement)) {
    return { error: fail("Permissão insuficiente para esta ação.", 403) };
  }
  const context: AdminContext = {
    id: profile.id,
    membershipId: selectedMembership.id,
    userId: authResult.user.id,
    email: authResult.user.email || profile.email,
    name: profile.full_name,
    role: effectiveRole,
    branchId: profile.branch_id || null,
    allowedBranchIds: membershipBranches,
    canViewFinancialData: Boolean(profile.can_view_financial_data || permissions.includes("financial.view")),
    tenantId: selectedMembership.tenant_id,
    tenantSlug: tenant.slug,
    tenantName: tenant.display_name,
    permissions,
    isPlatformSuperadmin: Boolean(platformProfile),
  };

  return {
    context,
    rawSupabase,
    supabase: createTenantScopedClient(rawSupabase, context.tenantId),
    user: authResult.user,
  };
}

export async function requireAdmin(
  request: NextRequest,
  requirement?: AdminRole[] | PermissionRequirement,
): Promise<AdminAuthResult> {
  try {
    return await requireAdminInternal(request, requirement);
  } catch (cause) {
    const code = cause instanceof Error && "code" in cause ? String((cause as Error & { code?: unknown }).code || "") : "";
    return {
      error: fail(
        code === "ENVIRONMENT_NOT_READY" ? "O ambiente administrativo está temporariamente indisponível." : "Não foi possível consultar os dados administrativos.",
        code === "ENVIRONMENT_NOT_READY" ? 503 : 500,
        {
          code: code === "ENVIRONMENT_NOT_READY" ? "ENVIRONMENT_NOT_READY" : "DATABASE_ERROR",
          requestId: request.headers.get("x-request-id") || undefined,
          technicalMessage: cause instanceof Error ? cause.message : "unknown",
        },
      ),
    };
  }
}

async function requirePlatformSuperadminInternal(request: NextRequest) {
  const authResult = await authenticatedUser(request);
  if ("error" in authResult) return authResult;
  const supabase = getSupabaseAdmin();
  const { data: profile, error } = await supabase
    .from("platform_superadmins")
    .select("id,auth_user_id,email,full_name,active")
    .eq("auth_user_id", authResult.user.id)
    .eq("active", true)
    .maybeSingle();
  if (error) return { error: fail("Erro ao validar administração da plataforma.", 500, { code: "DATABASE_ERROR", requestId: request.headers.get("x-request-id") || undefined, technicalMessage: error.message }) };
  if (!profile) return { error: fail("Acesso restrito à administração da plataforma.", 403, { code: "ADMIN_PROFILE_NOT_FOUND", requestId: request.headers.get("x-request-id") || undefined }) };
  return { context: profile, supabase, user: authResult.user, token: authResult.token };
}

export async function requirePlatformSuperadmin(request: NextRequest) {
  try {
    return await requirePlatformSuperadminInternal(request);
  } catch (cause) {
    const code = cause instanceof Error && "code" in cause ? String((cause as Error & { code?: unknown }).code || "") : "";
    return {
      error: fail(
        code === "ENVIRONMENT_NOT_READY" ? "O ambiente da plataforma está temporariamente indisponível." : "Não foi possível validar a administração da plataforma.",
        code === "ENVIRONMENT_NOT_READY" ? 503 : 500,
        {
          code: code === "ENVIRONMENT_NOT_READY" ? "ENVIRONMENT_NOT_READY" : "DATABASE_ERROR",
          requestId: request.headers.get("x-request-id") || undefined,
          technicalMessage: cause instanceof Error ? cause.message : "unknown",
        },
      ),
    };
  }
}
