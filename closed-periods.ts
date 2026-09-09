import type { SupabaseClient } from "@supabase/supabase-js";

export async function hasClosedPayrollForDate(params: {
  supabase: SupabaseClient;
  employeeId: string;
  branchId: string;
  date: string;
}) {
  const { supabase, employeeId, branchId, date } = params;
  const { data, error } = await supabase
    .from("payroll_periods")
    .select("id, title, status, payroll_items!inner(employee_id)")
    .lte("start_date", date)
    .gte("end_date", date)
    .in("status", ["closed", "closed_with_exceptions", "paid"])
    .or(`branch_id.is.null,branch_id.eq.${branchId}`)
    .eq("payroll_items.employee_id", employeeId)
    .limit(1);

  if (error) throw new Error(error.message);
  return data?.[0] || null;
}
