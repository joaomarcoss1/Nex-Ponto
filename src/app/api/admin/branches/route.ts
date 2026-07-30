import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/server/auth";
import { writeAuditLog } from "@/lib/server/audit";
import { canAccessBranch, canManageBranches, scopeByBranch } from "@/lib/server/branch-permissions";
import { fail, ok, readJson } from "@/lib/server/http";
import { enforceTenantLimit } from "@/lib/server/tenant-limits";

const branchSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().max(30).optional().nullable(),
  name: z.string().trim().min(2).max(120),
  type: z.enum(["matriz", "filial"]).default("filial"),
  address: z.string().trim().min(5).max(500),
  timezone: z.string().trim().min(3).max(80).default("America/Fortaleza"),
  responsible_name: z.string().trim().max(120).optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  allowed_radius_meters: z.coerce.number().int().min(20).max(5000).default(250),
  google_maps_url: z.string().trim().max(1000).optional().nullable(),
  map_place_id: z.string().trim().max(255).optional().nullable(),
  geofence_enabled: z.boolean().default(true),
  active: z.boolean().default(true)
});

type BranchInput = z.infer<typeof branchSchema>;
type ExistingBranch = {
  latitude?: number | string | null;
  longitude?: number | string | null;
  allowed_radius_meters?: number | null;
  geolocation_status?: string | null;
  gps_ready?: boolean | null;
  geolocation_confirmed_at?: string | null;
  geolocation_confirmed_by?: string | null;
};

function nullableText(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function branchPayload(body: BranchInput, previous?: ExistingBranch | null) {
  const coordinatesChanged = !previous
    || Number(previous.latitude) !== body.latitude
    || Number(previous.longitude) !== body.longitude
    || Number(previous.allowed_radius_meters) !== body.allowed_radius_meters;
  const configuredAt = new Date().toISOString();
  return {
    code: nullableText(body.code)?.toUpperCase() || null,
    name: body.name,
    type: body.type,
    address: body.address,
    timezone: body.timezone,
    responsible_name: nullableText(body.responsible_name),
    phone: nullableText(body.phone),
    latitude: body.latitude,
    longitude: body.longitude,
    allowed_radius_meters: body.allowed_radius_meters,
    google_maps_url: nullableText(body.google_maps_url),
    map_place_id: nullableText(body.map_place_id),
    geofence_enabled: body.geofence_enabled,
    geolocation_configured_at: configuredAt,
    geolocation_status: coordinatesChanged ? "pending" : previous?.geolocation_status || "pending",
    gps_ready: coordinatesChanged ? false : Boolean(previous?.gps_ready),
    geolocation_confirmed_at: coordinatesChanged ? null : previous?.geolocation_confirmed_at || null,
    geolocation_confirmed_by: coordinatesChanged ? null : previous?.geolocation_confirmed_by || null,
    active: body.active
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const status = request.nextUrl.searchParams.get("status");
  const q = request.nextUrl.searchParams.get("q");
  let query = auth.supabase.from("branches").select("*").order("name", { ascending: true });
  query = scopeByBranch(query, auth.context, "id");
  if (status === "active") query = query.eq("active", true);
  if (status === "inactive") query = query.eq("active", false);
  if (q) query = query.ilike("name", `%${q.replace(/[,%]/g, "")}%`);
  const [{ data, error }, employeesRes] = await Promise.all([
    query,
    scopeByBranch(auth.supabase.from("employees").select("id,branch_id").eq("active", true), auth.context, "branch_id")
  ]);
  if (error) return fail("Erro ao listar filiais.", 500, error.message);
  if (employeesRes.error) return fail("Erro ao calcular funcionários por filial.", 500, employeesRes.error.message);
  const employees = (employeesRes.data || []) as Array<{ id: string; branch_id: string }>;
  const branches = (data || []).map((branch) => ({
    ...branch,
    employee_count: employees.filter((employee) => employee.branch_id === branch.id).length
  }));
  return ok({ branches });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  if (!canManageBranches(auth.context)) return fail("Você não tem permissão para criar unidades.", 403);
  const parsed = branchSchema.safeParse(await readJson(request));
  if (!parsed.success) return fail("Revise os dados da filial.", 400, parsed.error.flatten());
  try {
    await enforceTenantLimit({ supabase: auth.supabase, tenantId: auth.context.tenantId, limit: "branch_limit", currentTable: "branches" });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Limite de filiais atingido.", 409);
  }
  const payload = branchPayload(parsed.data);
  const { data, error } = await auth.supabase.from("branches").insert(payload).select("*").single();
  if (error) return fail("Erro ao criar filial.", 500, error.message);
  await writeAuditLog({
    supabase: auth.supabase,
    context: auth.context,
    action: "branch.create",
    entity: "branches",
    entityId: data.id,
    newData: data,
    headers: request.headers
  });
  return ok({ branch: data, gpsValidationRequired: true });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  if (!canManageBranches(auth.context)) return fail("Você não tem permissão para editar unidades.", 403);
  const parsed = branchSchema.safeParse(await readJson(request));
  if (!parsed.success || !parsed.data.id) return fail("Revise os dados e informe o ID da filial.", 400, parsed.success ? undefined : parsed.error.flatten());
  if (!canAccessBranch(auth.context, parsed.data.id)) return fail("Você não tem acesso a esta filial.", 403);
  const { data: oldData, error: oldError } = await auth.supabase.from("branches").select("*").eq("id", parsed.data.id).maybeSingle();
  if (oldError) return fail("Erro ao consultar filial.", 500, oldError.message);
  if (!oldData) return fail("Filial não encontrada.", 404);
  const payload = branchPayload(parsed.data, oldData);
  const { data, error } = await auth.supabase.from("branches").update(payload).eq("id", parsed.data.id).select("*").single();
  if (error) return fail("Erro ao atualizar filial.", 500, error.message);
  await writeAuditLog({
    supabase: auth.supabase,
    context: auth.context,
    action: "branch.update",
    entity: "branches",
    entityId: data.id,
    oldData,
    newData: data,
    headers: request.headers
  });
  return ok({ branch: data, gpsValidationRequired: data.geolocation_status !== "confirmed" });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return fail("ID da filial obrigatório.", 400);
  if (!canManageBranches(auth.context)) return fail("Você não tem permissão para desativar unidades.", 403);
  if (!canAccessBranch(auth.context, id)) return fail("Você não tem acesso a esta filial.", 403);
  const { data: oldData } = await auth.supabase.from("branches").select("*").eq("id", id).maybeSingle();
  const { data, error } = await auth.supabase.from("branches").update({ active: false }).eq("id", id).select("*").single();
  if (error) return fail("Erro ao desativar filial.", 500, error.message);
  await writeAuditLog({
    supabase: auth.supabase,
    context: auth.context,
    action: "branch.deactivate",
    entity: "branches",
    entityId: id,
    oldData,
    newData: data,
    headers: request.headers
  });
  return ok({ branch: data });
}
