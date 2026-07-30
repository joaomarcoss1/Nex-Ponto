import type { SupabaseClient } from "@supabase/supabase-js";

export type TenantLimitKey = "employee_limit" | "branch_limit";

export async function enforceTenantLimit(params: {
  supabase: SupabaseClient;
  tenantId: string;
  limit: TenantLimitKey;
  currentTable: "employees" | "branches";
}) {
  const { supabase, tenantId, limit, currentTable } = params;
  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("plan_id, tenant_subscriptions(status, subscription_plans(employee_limit,branch_limit))")
    .eq("id", tenantId)
    .maybeSingle();
  if (tenantError) throw new Error(`Falha ao validar plano: ${tenantError.message}`);

  const subscription = Array.isArray(tenant?.tenant_subscriptions)
    ? tenant?.tenant_subscriptions.find((item: { status?: string }) => ["trialing", "active"].includes(String(item.status)))
    : tenant?.tenant_subscriptions;
  const plan = Array.isArray(subscription?.subscription_plans)
    ? subscription?.subscription_plans[0]
    : subscription?.subscription_plans;
  const maximum = plan?.[limit];
  if (maximum === null || maximum === undefined) return;

  const { count, error: countError } = await supabase
    .from(currentTable)
    .select("id", { count: "exact", head: true })
    .eq("active", true);
  if (countError) throw new Error(`Falha ao validar uso do plano: ${countError.message}`);
  if ((count || 0) >= Number(maximum)) {
    throw new Error(`Limite do plano atingido para ${currentTable === "employees" ? "funcionários" : "filiais"}.`);
  }
}
