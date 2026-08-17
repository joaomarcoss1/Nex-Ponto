import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin, getSupabaseAuthClient } from "@/lib/server/db";
import { fail, ok, readJson } from "@/lib/server/http";

const bootstrapSchema = z.object({
  setupToken: z.string().min(16),
  email: z.string().email(),
  password: z.string().min(10).regex(/[A-Za-z]/, "A senha deve conter uma letra.").regex(/\d/, "A senha deve conter um número."),
  name: z.string().trim().min(3).max(120)
});

async function findAuthUserByEmail(email: string) {
  const supabase = getSupabaseAdmin();
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const user = data?.users?.find((item) => String(item.email || "").toLowerCase() === email.toLowerCase());
    if (user) return user;
    if (!data?.users?.length || data.users.length < 200) break;
  }
  return null;
}

function bootstrapConfig() {
  const setupToken = process.env.MASTER_SETUP_TOKEN?.trim() || "";
  const ownerEmail = process.env.MASTER_ADMIN_EMAIL?.trim().toLowerCase() || "";
  return {
    setupToken,
    ownerEmail,
    ownerName: process.env.MASTER_ADMIN_NAME?.trim() || "Proprietário da empresa",
    tenantName: process.env.MASTER_TENANT_NAME?.trim() || "Empresa principal",
    tenantSlug: process.env.MASTER_TENANT_SLUG?.trim().toLowerCase() || "empresa-principal",
    timezone: process.env.MASTER_TENANT_TIMEZONE?.trim() || "America/Sao_Paulo",
    platformSuperadminEmail: process.env.PLATFORM_SUPERADMIN_EMAIL?.trim().toLowerCase() || ""
  };
}

export async function GET() {
  try {
    const config = bootstrapConfig();
    const supabase = getSupabaseAdmin();
    const { count, error } = await supabase
      .from("tenant_memberships")
      .select("id", { count: "exact", head: true })
      .eq("active", true)
      .in("role", ["tenant_owner", "master_admin"]);

    if (error) return fail("Não foi possível verificar a configuração inicial. Confirme se todas as migrations v4 foram aplicadas.", 500, error.message);

    return ok({
      setupAvailable: (count || 0) === 0 && Boolean(config.setupToken && config.ownerEmail),
      configuredEmail: config.ownerEmail ? config.ownerEmail.replace(/(^.).+(@.*$)/, "$1••••$2") : null,
      tenantName: config.tenantName
    });
  } catch (error) {
    return fail("Não foi possível verificar a configuração inicial.", 500, error instanceof Error ? error.message : error);
  }
}

export async function POST(request: NextRequest) {
  let createdAuthUserId: string | null = null;
  try {
    const config = bootstrapConfig();
    if (!config.setupToken || !config.ownerEmail) {
      return fail("Configuração inicial desativada. Defina MASTER_ADMIN_EMAIL e MASTER_SETUP_TOKEN somente durante a ativação.", 403);
    }

    const parsed = bootstrapSchema.safeParse(await readJson<unknown>(request));
    if (!parsed.success) {
      return fail("Revise os dados da configuração inicial.", 400, parsed.error.flatten());
    }
    const body = parsed.data;
    if (body.setupToken !== config.setupToken) return fail("Token de configuração inválido.", 403);
    if (body.email.trim().toLowerCase() !== config.ownerEmail) {
      return fail("O e-mail informado não corresponde ao MASTER_ADMIN_EMAIL.", 403);
    }

    const supabase = getSupabaseAdmin();
    const { count, error: existingError } = await supabase
      .from("tenant_memberships")
      .select("id", { count: "exact", head: true })
      .eq("active", true)
      .in("role", ["tenant_owner", "master_admin"]);
    if (existingError) return fail("Não foi possível validar a configuração existente.", 500, existingError.message);
    if ((count || 0) > 0) return fail("A configuração inicial já foi concluída.", 409);

    const authHeader = request.headers.get("authorization") || "";
    const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
    let authUserId: string;

    if (accessToken) {
      const authClient = getSupabaseAuthClient();
      const { data, error } = await authClient.auth.getUser(accessToken);
      if (error || !data.user?.email) return fail("Sessão inválida.", 401);
      if (data.user.email.toLowerCase() !== config.ownerEmail) {
        return fail("A sessão autenticada não corresponde ao proprietário configurado.", 403);
      }
      authUserId = data.user.id;
    } else {
      const existingAuthUser = await findAuthUserByEmail(config.ownerEmail);
      if (existingAuthUser) {
        const { error } = await supabase.auth.admin.updateUserById(existingAuthUser.id, {
          password: body.password,
          email_confirm: true,
          user_metadata: { full_name: body.name, bootstrap_role: "tenant_owner" }
        });
        if (error) return fail("Não foi possível preparar o usuário de autenticação existente.", 500, error.message);
        authUserId = existingAuthUser.id;
      } else {
        const { data, error } = await supabase.auth.admin.createUser({
          email: config.ownerEmail,
          password: body.password,
          email_confirm: true,
          user_metadata: { full_name: body.name, bootstrap_role: "tenant_owner" }
        });
        if (error || !data.user?.id) return fail("Não foi possível criar o usuário de autenticação.", 500, error?.message);
        authUserId = data.user.id;
        createdAuthUserId = data.user.id;
      }
    }

    const makePlatformSuperadmin = Boolean(config.platformSuperadminEmail && config.platformSuperadminEmail === config.ownerEmail);
    const { data, error } = await supabase.rpc("bootstrap_tenant_owner_v4", {
      p_auth_user_id: authUserId,
      p_email: config.ownerEmail,
      p_full_name: body.name || config.ownerName,
      p_tenant_slug: config.tenantSlug,
      p_tenant_name: config.tenantName,
      p_timezone: config.timezone,
      p_make_platform_superadmin: makePlatformSuperadmin
    });

    if (error) {
      if (createdAuthUserId) await supabase.auth.admin.deleteUser(createdAuthUserId).catch(() => undefined);
      return fail("Não foi possível concluir a criação atômica da empresa e do proprietário.", 500, error.message);
    }

    return ok({
      setupComplete: true,
      result: data,
      message: "Empresa e proprietário configurados com sucesso. Remova MASTER_SETUP_TOKEN e qualquer senha temporária das variáveis de ambiente."
    });
  } catch (error) {
    if (createdAuthUserId) {
      await getSupabaseAdmin().auth.admin.deleteUser(createdAuthUserId).catch(() => undefined);
    }
    return fail(error instanceof Error ? error.message : "Erro inesperado na configuração inicial.", 500);
  }
}
