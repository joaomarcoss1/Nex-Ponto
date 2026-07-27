import { NextRequest } from "next/server";
import { z } from "zod";
import { readEmployeeSession } from "@/lib/server/employee-session";
import { fail, ok } from "@/lib/server/http";
import { requirePublicTenant } from "@/lib/server/public-tenant";
const schema = z.object({ notificationId: z.string().uuid() });
export async function PATCH(request: NextRequest) {
  const { tenant, rawSupabase } = await requirePublicTenant(request);
  const session = readEmployeeSession(request);
  if (!session || session.tenantId !== tenant.id) return fail("Sessão do funcionário expirada.", 401);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Notificação inválida.", 422);
  const { data, error } = await rawSupabase.rpc("mark_employee_notification_read_v4", { p_tenant_id: tenant.id, p_employee_id: session.employeeId, p_notification_id: parsed.data.notificationId });
  if (error) return fail("Erro ao atualizar notificação.", 500, error.message);
  return ok({ updated: Boolean(data) });
}
