import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/server/auth";
import { fail, ok } from "@/lib/server/http";
import { writeAuditLog } from "@/lib/server/audit";

const updateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["active", "revoked", "blocked"]),
  reason: z.string().trim().min(5).max(500),
  employeeId: z.string().uuid().nullable().optional(),
  branchId: z.string().uuid().nullable().optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request, { any: ["employee.manage", "time_entry.review"] });
  if ("error" in auth) return auth.error;
  const { data, error } = await auth.supabase
    .from("authorized_devices")
    .select("id,display_name,status,trust_level,platform,browser,first_used_at,last_used_at,activated_at,revoked_at,employee_id,branch_id,employees(full_name),branches(name)")
    .order("last_used_at", { ascending: false })
    .limit(500);
  if (error) return fail("Erro ao carregar dispositivos.", 500, error.message);
  return ok({ devices: data || [] });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request, { all: ["time_entry.review"] });
  if ("error" in auth) return auth.error;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Revise a decisão do dispositivo.", 422, parsed.error.flatten());
  const input = parsed.data;
  const { data: oldData } = await auth.supabase.from("authorized_devices").select("*").eq("id", input.id).maybeSingle();
  if (!oldData) return fail("Dispositivo não encontrado.", 404);
  const patch = {
    status: input.status,
    employee_id: input.employeeId === undefined ? oldData.employee_id : input.employeeId,
    branch_id: input.branchId === undefined ? oldData.branch_id : input.branchId,
    trust_level: input.status === "active" ? "trusted" : "unverified",
    activated_at: input.status === "active" ? new Date().toISOString() : oldData.activated_at,
    activated_by: input.status === "active" ? auth.context.userId : oldData.activated_by,
    revoked_at: input.status === "revoked" ? new Date().toISOString() : null,
    revoked_by: input.status === "revoked" ? auth.context.userId : null,
    revocation_reason: input.status === "active" ? null : input.reason,
  };
  const { data, error } = await auth.supabase.from("authorized_devices").update(patch).eq("id", input.id).select("*").single();
  if (error) return fail("Erro ao atualizar dispositivo.", 500, error.message);
  await writeAuditLog({
    supabase: auth.supabase,
    context: auth.context,
    headers: request.headers,
    action: `device_${input.status}`,
    entity: "authorized_devices",
    entityId: input.id,
    reason: input.reason,
    oldData,
    newData: data,
  });
  return ok({ device: data });
}
