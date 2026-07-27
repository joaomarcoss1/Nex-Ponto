import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { scopeByBranch } from "@/lib/server/branch-permissions";
import { fail, ok } from "@/lib/server/http";

function item(key: string, label: string, passed: boolean, action: string, severity: "ok" | "warning" | "critical" = passed ? "ok" : "critical") {
  return { key, label, passed, severity: passed ? "ok" : severity, action: passed ? "Concluído" : action };
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const branchesQuery = scopeByBranch(auth.supabase.from("branches").select("*").order("name"), auth.context, "id");
  const employeesQuery = scopeByBranch(auth.supabase.from("employees").select("id, branch_id, pin_hash, expected_start_time, expected_end_time, expected_lunch_start_time, expected_lunch_end_time, payment_day, role, monthly_salary, daily_rate, active").eq("active", true), auth.context, "branch_id");
  const [branchesRes, employeesRes] = await Promise.all([branchesQuery, employeesQuery]);
  if (branchesRes.error) return fail("Erro ao montar checklist das lojas.", 500, branchesRes.error.message);
  if (employeesRes.error) return fail("Erro ao consolidar funcionários por filial.", 500, employeesRes.error.message);

  const employees = employeesRes.data || [];
  const readiness = (branchesRes.data || []).map((branch: any) => {
    const branchEmployees = employees.filter((employee: any) => employee.branch_id === branch.id);
    const latitudeOk = Number.isFinite(Number(branch.latitude));
    const longitudeOk = Number.isFinite(Number(branch.longitude));
    const radiusOk = Number(branch.allowed_radius_meters || 0) > 0;
    const gpsConfirmed = Boolean(branch.gps_ready || branch.geolocation_status === "confirmed" || branch.geolocation_confirmed_at);
    const withoutPin = branchEmployees.filter((employee: any) => !employee.pin_hash).length;
    const withoutSchedule = branchEmployees.filter((employee: any) => !employee.expected_start_time || !employee.expected_end_time).length;
    const withoutLunch = branchEmployees.filter((employee: any) => !employee.expected_lunch_start_time || !employee.expected_lunch_end_time).length;
    const withoutPaymentDay = branchEmployees.filter((employee: any) => !employee.payment_day).length;
    const withoutRole = branchEmployees.filter((employee: any) => !employee.role || String(employee.role).toLowerCase().includes("a definir")).length;
    const withoutSalary = branchEmployees.filter((employee: any) => !Number(employee.monthly_salary || employee.daily_rate || 0)).length;
    const checks = [
      item("active", "Filial ativa", Boolean(branch.active), "Ative a unidade em Filiais."),
      item("name", "Nome da filial configurado", Boolean(String(branch.name || "").trim()), "Preencha o nome da unidade."),
      item("latitude", "Latitude preenchida", latitudeOk, "Abra a filial e marque a localização real."),
      item("longitude", "Longitude preenchida", longitudeOk, "Abra a filial e marque a localização real."),
      item("radius", "Raio permitido definido", radiusOk, "Configure o raio permitido para ponto."),
      item("geofence", "Geofence ativa", Boolean(branch.geofence_enabled), "Ative a geofence da filial."),
      item("gps_confirmed", "GPS confirmado por admin", gpsConfirmed, "Confirme a coordenada real presencialmente."),
      item("employees", "Funcionários ativos vinculados", branchEmployees.length > 0, "Vincule ao menos um funcionário ativo à unidade."),
      item("pin", "Funcionários com PIN", withoutPin === 0, `${withoutPin} funcionário(s) sem PIN.`, "critical"),
      item("schedule", "Horário de entrada/saída", withoutSchedule === 0, `${withoutSchedule} funcionário(s) sem horário completo.`, "critical"),
      item("lunch", "Horário de almoço", withoutLunch === 0, `${withoutLunch} funcionário(s) sem saída/retorno de almoço.`, "warning"),
      item("payment_day", "Dia de pagamento", withoutPaymentDay === 0, `${withoutPaymentDay} funcionário(s) sem dia de pagamento.`, "warning"),
      item("role", "Cargo definido", withoutRole === 0, `${withoutRole} funcionário(s) sem cargo definido.`, "critical"),
      item("salary", "Salário/diária", withoutSalary === 0, `${withoutSalary} funcionário(s) sem remuneração.`, "critical"),
      item("inside_test", "Teste GPS dentro do raio", Boolean(branch.last_inside_radius_test_at || branch.last_gps_test_at), "Realize teste com celular dentro da loja.", "warning"),
      item("outside_test", "Teste GPS fora do raio", Boolean(branch.last_outside_radius_test_at), "Realize teste com celular fora do raio.", "warning")
    ];
    const critical = checks.filter((check) => !check.passed && check.severity === "critical").length;
    const warnings = checks.filter((check) => !check.passed && check.severity === "warning").length;
    const readiness_status = critical > 0 ? "blocked" : warnings > 0 ? "attention" : "ready";
    return {
      branch_id: branch.id,
      branch_name: branch.name,
      active: branch.active,
      latitude: branch.latitude,
      longitude: branch.longitude,
      allowed_radius_meters: branch.allowed_radius_meters || 900,
      geofence_enabled: branch.geofence_enabled,
      geolocation_confirmed: gpsConfirmed,
      geolocation_confirmed_at: branch.geolocation_confirmed_at || null,
      employee_count: branchEmployees.length,
      employees_without_pin: withoutPin,
      employees_without_schedule: withoutSchedule,
      employees_without_lunch_schedule: withoutLunch,
      employees_without_payment_day: withoutPaymentDay,
      employees_without_salary: withoutSalary,
      last_gps_test_at: branch.last_gps_test_at || null,
      last_inside_radius_test_at: branch.last_inside_radius_test_at || null,
      last_outside_radius_test_at: branch.last_outside_radius_test_at || null,
      readiness_status,
      progress: Math.round((checks.filter((check) => check.passed).length / checks.length) * 100),
      checklist_items: checks
    };
  });

  return ok({ readiness });
}
