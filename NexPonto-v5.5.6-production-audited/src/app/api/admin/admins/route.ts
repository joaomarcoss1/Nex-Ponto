import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { fail, ok, readJson } from "@/lib/server/http";
import type { AdminRole } from "@/types/domain";
import { adminPayloadSchema, zodErrorMessage } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ROLES: AdminRole[] = ["master_admin", "admin", "admin_geral", "gerente_filial", "rh_financeiro"];

function validateAdminPassword(password: string) {
  if (password.length < 10) return "A senha administrativa deve ter pelo menos 10 caracteres.";
  if (!/[A-Za-zÀ-ÿ]/.test(password) || !/\d/.test(password)) return "A senha administrativa deve conter letras e números.";
  return null;
}

async function activeMasterCount(supabase: any) {
  const { count, error } = await supabase.from("admin_users").select("id", { count: "exact", head: true }).eq("role", "master_admin").eq("active", true);
  if (error) throw new Error(error.message);
  return count || 0;
}

function parseBranchIds(value: unknown) {
  if (typeof value === "string") {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function normalizePayload(body: any) {
  const email = String(body.email || "").trim().toLowerCase();
  const fullName = String(body.full_name || "").trim();
  const role = (body.role || "admin_geral") as AdminRole;
  return {
    email,
    full_name: fullName,
    role: ALLOWED_ROLES.includes(role) ? role : "admin_geral",
    branch_id: body.branch_id || null,
    allowed_branch_ids: parseBranchIds(body.allowed_branch_ids),
    can_view_financial_data: Boolean(body.can_view_financial_data),
    active: body.active ?? true,
  };
}

async function rollbackNewAuthUser(supabase: any, authResult: { userId: string; createdNow: boolean }) {
  if (!authResult.createdNow) return;
  await supabase.auth.admin.deleteUser(authResult.userId).catch(() => undefined);
}

async function upsertTenantAdmin(params: {
  auth: any;
  adminId?: string | null;
  payload: ReturnType<typeof normalizePayload>;
  authUserId: string;
  action: "create" | "update" | "deactivate";
  request: NextRequest;
}) {
  const requestId = params.request.headers.get("x-request-id") || randomUUID();
  const { data, error } = await params.auth.rawSupabase.rpc("upsert_tenant_admin_v556", {
    p_tenant_id: params.auth.context.tenantId,
    p_admin_id: params.adminId || null,
    p_auth_user_id: params.authUserId,
    p_email: params.payload.email,
    p_full_name: params.payload.full_name,
    p_role: params.payload.role,
    p_branch_id: params.payload.branch_id,
    p_allowed_branch_ids: params.payload.allowed_branch_ids,
    p_can_view_financial_data: params.payload.can_view_financial_data,
    p_active: params.action === "deactivate" ? false : params.payload.active,
    p_actor_user_id: params.auth.context.userId,
    p_actor_membership_id: params.auth.context.membershipId || null,
    p_action: params.action,
    p_request_id: requestId,
  });
  if (error) throw new Error(error.message);
  const admin = Array.isArray(data) ? data[0] : data;
  if (!admin) throw new Error("RPC upsert_tenant_admin_v556 não retornou administrador.");
  return admin;
}

async function findAuthUserByEmail(supabase: any, email: string) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const user = data?.users?.find((item: any) => String(item.email || "").toLowerCase() === email);
    if (user) return user;
    if (!data?.users?.length || data.users.length < 200) break;
  }
  return null;
}

async function validatePayload(supabase: any, payload: ReturnType<typeof normalizePayload>) {
  if (!payload.email || !payload.full_name) return "Preencha e-mail e nome.";
  if (!/^\S+@\S+\.\S+$/.test(payload.email)) return "Informe um e-mail válido.";
  if (payload.role === "gerente_filial" && !payload.branch_id) {
    return "Gerente de filial precisa ter uma filial principal selecionada.";
  }

  const branchIds = [payload.branch_id, ...payload.allowed_branch_ids].filter(Boolean) as string[];
  if (branchIds.length) {
    const { data, error } = await supabase.from("branches").select("id").in("id", [...new Set(branchIds)]);
    if (error) return `Erro ao validar filiais: ${error.message}`;
    if ((data || []).length !== new Set(branchIds).size) return "Uma ou mais filiais selecionadas não existem.";
  }
  return null;
}

async function ensureAuthUser(params: {
  supabase: any;
  email: string;
  fullName: string;
  password?: string;
  knownUserId?: string | null;
}) {
  const { supabase, email, fullName, password, knownUserId } = params;
  let authUser = knownUserId ? { id: knownUserId, email } : await findAuthUserByEmail(supabase, email);
  let createdNow = false;

  if (!authUser && !password) {
    throw new Error("Este e-mail ainda não existe no Supabase Auth. Informe uma senha inicial para criar o login.");
  }

  if (!authUser && password) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, must_change_password: true },
    });
    if (error) {
      if (!String(error.message || "").toLowerCase().includes("already")) throw new Error(error.message);
      authUser = await findAuthUserByEmail(supabase, email);
    } else {
      authUser = data.user;
      createdNow = Boolean(data.user?.id);
    }
  }

  if (!authUser?.id) throw new Error("Não foi possível localizar ou criar o login no Supabase Auth.");

  const updatePayload: Record<string, unknown> = {
    email,
    email_confirm: true,
    user_metadata: { full_name: fullName, must_change_password: Boolean(password) },
  };
  if (password) updatePayload.password = password;
  const { error: updateError } = await supabase.auth.admin.updateUserById(authUser.id, updatePayload);
  if (updateError) throw new Error(updateError.message);

  return { userId: authUser.id as string, createdNow };
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request, { all: ["administrators.manage"] });
  if ("error" in auth) return auth.error;
  const page = Math.max(1, Number(request.nextUrl.searchParams.get("page") || 0));
  const pageSize = Math.min(100, Math.max(10, Number(request.nextUrl.searchParams.get("pageSize") || 25)));
  const q = String(request.nextUrl.searchParams.get("q") || "").replace(/[,%()]/g, " ").trim();
  const paginated = request.nextUrl.searchParams.has("page");
  let query = auth.supabase
    .from("admin_users")
    .select("*, branches:branches!admin_users_branch_id_fkey(name)", { count: "exact" })
    .order("created_at", { ascending: false });
  if (q) query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`);
  if (paginated) query = query.range((page - 1) * pageSize, page * pageSize - 1);
  const { data, error, count } = await query;
  if (error) return fail("Erro ao listar administradores.", 500, error.message);
  return ok({ admins: data || [], currentRole: auth.context.role, pagination: paginated ? { page, pageSize, total: count || 0 } : undefined });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request, { all: ["administrators.manage"] });
  if ("error" in auth) return auth.error;

  const rawBody = await readJson<unknown>(request);
  const parsedBody = adminPayloadSchema.safeParse(rawBody);
  if (!parsedBody.success) return fail(zodErrorMessage(parsedBody.error), 400);
  const body = parsedBody.data;
  const password = String(body.password || "").trim();
  if (password) {
    const passwordError = validateAdminPassword(password);
    if (passwordError) return fail(passwordError, 400);
  }

  const payload = normalizePayload(body);
  const validationError = await validatePayload(auth.supabase, payload);
  if (validationError) return fail(validationError, 400);

  const { data: existingAdmin, error: existingError } = await auth.supabase
    .from("admin_users")
    .select("*")
    .eq("email", payload.email)
    .maybeSingle();
  if (existingError) return fail("Erro ao verificar administrador existente.", 500, existingError.message);

  if (existingAdmin?.email === auth.context.email && payload.role !== "master_admin") {
    return fail("Você não pode remover seu próprio perfil master por esta tela.", 409);
  }

  let authResult: { userId: string; createdNow: boolean };
  try {
    authResult = await ensureAuthUser({
      supabase: auth.supabase,
      email: payload.email,
      fullName: payload.full_name,
      password: password || undefined,
      knownUserId: existingAdmin?.auth_user_id || null,
    });
  } catch (error) {
    return fail("Não foi possível preparar o login do administrador.", 400, error instanceof Error ? error.message : String(error));
  }

  let data: any;
  try {
    data = await upsertTenantAdmin({
      auth,
      adminId: existingAdmin?.id || null,
      payload: { ...payload, active: true },
      authUserId: authResult.userId,
      action: existingAdmin ? "update" : "create",
      request,
    });
  } catch (error) {
    await rollbackNewAuthUser(auth.rawSupabase, authResult);
    return fail("Erro ao criar/sincronizar administrador.", 500, {
      code: "DATABASE_ERROR",
      authUserRemoved: authResult.createdNow,
      technicalMessage: error instanceof Error ? error.message : String(error),
    });
  }

  const notificationResult = await auth.supabase.from("admin_notifications").insert({
    admin_user_id: data.id,
    branch_id: payload.branch_id,
    title: "Troque sua senha no primeiro acesso",
    message: "Por segurança, utilize a recuperação de senha do painel para definir uma senha pessoal após o primeiro acesso.",
    notification_type: "security",
    payload: { must_change_password: true },
  });
  if (notificationResult.error) console.error("[admins] aviso de troca de senha não foi criado", notificationResult.error);
  return ok({ admin: data, message: existingAdmin ? "Login, administrador e vínculo atualizados com sucesso." : "Administrador, login e vínculo criados com sucesso." });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdmin(request, { all: ["administrators.manage"] });
  if ("error" in auth) return auth.error;
  const rawBody = await readJson<unknown>(request);
  const parsedBody = adminPayloadSchema.safeParse(rawBody);
  if (!parsedBody.success) return fail(zodErrorMessage(parsedBody.error), 400);
  const body = parsedBody.data;
  if (!body.id) return fail("ID obrigatório.", 400);

  const { data: oldData, error: oldError } = await auth.supabase
    .from("admin_users")
    .select("*")
    .eq("id", body.id)
    .maybeSingle();
  if (oldError) return fail("Erro ao localizar administrador.", 500, oldError.message);
  if (!oldData) return fail("Administrador não encontrado.", 404);

  const payload = normalizePayload(body);
  const validationError = await validatePayload(auth.supabase, payload);
  if (validationError) return fail(validationError, 400);
  if (oldData.email === auth.context.email && payload.role !== "master_admin") {
    return fail("Você não pode remover seu próprio perfil master por esta tela.", 409);
  }
  if (oldData.email === auth.context.email && payload.active === false) {
    return fail("Você não pode desativar seu próprio usuário master.", 409);
  }
  if (oldData.role === "master_admin" && (payload.role !== "master_admin" || payload.active === false)) {
    try {
      if (await activeMasterCount(auth.supabase) <= 1) return fail("Não é possível remover ou desativar o último administrador master ativo.", 409);
    } catch (error) {
      return fail("Não foi possível validar os administradores master ativos.", 500, error instanceof Error ? error.message : error);
    }
  }

  const password = String(body.password || "").trim();
  if (password) {
    const passwordError = validateAdminPassword(password);
    if (passwordError) return fail(passwordError, 400);
  }

  let authResult: { userId: string; createdNow: boolean };
  try {
    authResult = await ensureAuthUser({
      supabase: auth.supabase,
      email: payload.email,
      fullName: payload.full_name,
      password: password || undefined,
      knownUserId: oldData.auth_user_id || null,
    });
  } catch (error) {
    return fail("Não foi possível atualizar o login do administrador.", 400, error instanceof Error ? error.message : String(error));
  }

  let data: any;
  try {
    data = await upsertTenantAdmin({
      auth,
      adminId: body.id,
      payload,
      authUserId: authResult.userId,
      action: "update",
      request,
    });
  } catch (error) {
    await rollbackNewAuthUser(auth.rawSupabase, authResult);
    return fail("Erro ao atualizar/sincronizar administrador.", 500, {
      code: "DATABASE_ERROR",
      authUserRemoved: authResult.createdNow,
      technicalMessage: error instanceof Error ? error.message : String(error),
    });
  }
  return ok({ admin: data, message: "Administrador atualizado com sucesso." });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin(request, { all: ["administrators.manage"] });
  if ("error" in auth) return auth.error;
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return fail("ID obrigatório.", 400);

  const { data: oldData, error: oldError } = await auth.supabase
    .from("admin_users")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (oldError) return fail("Erro ao localizar administrador.", 500, oldError.message);
  if (!oldData) return fail("Administrador não encontrado.", 404);
  if (oldData.email === auth.context.email) return fail("Você não pode desativar seu próprio usuário master por aqui.", 409);
  if (oldData.role === "master_admin" && oldData.active) {
    try {
      if (await activeMasterCount(auth.supabase) <= 1) return fail("Não é possível desativar o último administrador master ativo.", 409);
    } catch (error) {
      return fail("Não foi possível validar os administradores master ativos.", 500, error instanceof Error ? error.message : error);
    }
  }

  try {
    const data = await upsertTenantAdmin({
      auth,
      adminId: id,
      payload: {
        email: oldData.email,
        full_name: oldData.full_name,
        role: oldData.role,
        branch_id: oldData.branch_id,
        allowed_branch_ids: oldData.allowed_branch_ids || [],
        can_view_financial_data: oldData.can_view_financial_data,
        active: false,
      },
      authUserId: oldData.auth_user_id,
      action: "deactivate",
      request,
    });
    return ok({ admin: data });
  } catch (error) {
    return fail("Erro ao desativar/sincronizar administrador.", 500, {
      code: "DATABASE_ERROR",
      technicalMessage: error instanceof Error ? error.message : String(error),
    });
  }
}
