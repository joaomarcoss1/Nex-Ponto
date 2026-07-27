import { NextRequest } from "next/server";
import { getTenantExportBranding } from "@/lib/server/tenant-branding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { analyzeInconsistencies } from "@/lib/calculations";
import { formatDateTime, formatMoney, minutesToHourText } from "@/lib/format";
import { buildAbsenceReport } from "@/lib/services/absence-engine";
import { fetchScheduleContext } from "@/lib/services/schedule-engine";
import { requireAdmin } from "@/lib/server/auth";
import { writeAuditLog } from "@/lib/server/audit";
import type { ExportTable } from "@/lib/server/exporters";
import { fail, ok } from "@/lib/server/http";
import { canViewFinancialData, canAccessBranch, scopeByBranch } from "@/lib/server/branch-permissions";
import { getSystemSettings } from "@/lib/server/settings";


function asText(value: unknown) {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function compactBranchName(value: unknown) {
  return String(value || "-")
    .replace(/^NexPonto\s*/i, "")
    .replace(/^Filial\s*/i, "")
    .trim() || "NexPonto";
}

function compactMoney(value: unknown) {
  return formatMoney(Number(value || 0));
}

function moneySum(data: any[], key: string) {
  return data.reduce((sum, item) => sum + Number(item[key] || 0), 0);
}

function buildTable(type: string, data: any[], footer: string, meta: string[] = [], format: string = "json"): ExportTable {

  if (type === "executive") {
    return {
      title: "Relatório Executivo Mensal",
      subtitle: "Visão consolidada para diretoria: custo, faltas, atrasos, horas extras e alertas por filial.",
      meta,
      summary: [
        { label: "Filiais", value: data.length },
        { label: "Funcionários", value: data.reduce((sum, item) => sum + Number(item.active_employees || 0), 0) },
        { label: "Ocorrências", value: data.reduce((sum, item) => sum + Number(item.total_occurrences || 0), 0) },
        { label: "Custo folha", value: formatMoney(moneySum(data, "payroll_total")) }
      ],
      headers: ["Filial", "Funcionários", "Pontos", "Faltas", "Atrasos", "Saídas ant.", "HE aprov.", "Justif. pend.", "Inconsistências", "Custo folha", "Alerta executivo"],
      rows: data.map((item) => [
        item.branch_name,
        item.active_employees,
        item.total_points,
        item.identified_absences,
        minutesToHourText(item.total_late_minutes),
        minutesToHourText(item.total_early_leave_minutes),
        minutesToHourText(item.approved_overtime_minutes),
        item.pending_justifications,
        item.inconsistencies,
        formatMoney(item.payroll_total),
        Number(item.total_occurrences || 0) > 10 ? "Atenção: alto volume de ocorrências" : "Operação sob controle"
      ]),
      footer
    };
  }

  if (type === "points") {
    return {
      title: "Relatório de Pontos",
      subtitle: "Registros com ação, localização, distância, status e justificativas.",
      meta,
      summary: [
        { label: "Total de pontos", value: data.length },
        { label: "Pendentes", value: data.filter((item) => item.status === "pending_review").length },
        { label: "Fora do raio", value: data.filter((item) => !item.inside_allowed_radius).length },
        { label: "Atrasos", value: data.filter((item) => item.late_minutes > 0).length }
      ],
      headers: ["Funcionário", "Filial", "Ação", "Data/Hora", "Status", "Distância", "Atraso", "Saída ant.", "Revisão", "Justificativa"],
      rows: data.map((item) => [
        item.employees?.full_name || "-",
        item.branches?.name || "-",
        item.action,
        formatDateTime(item.entry_timestamp),
        item.status,
        item.distance_meters ? `${item.distance_meters}m` : "-",
        minutesToHourText(item.late_minutes),
        minutesToHourText(item.early_leave_minutes),
        item.occurrence_review_status || "-",
        asText(item.justification_text)
      ]),
      footer
    };
  }

  if (type === "absences") {
    return {
      title: "Relatório de Faltas",
      subtitle: "Faltas detectadas automaticamente por escala, ponto, feriado e justificativa.",
      meta,
      summary: [
        { label: "Linhas", value: data.length },
        { label: "Sem justificativa", value: data.filter((item) => item.absence_status === "without_justification").length },
        { label: "Aprovadas", value: data.filter((item) => item.absence_status === "approved").length },
        { label: "Com desconto", value: data.filter((item) => item.generates_discount).length }
      ],
      headers: ["Funcionário", "Filial", "Cargo", "Data", "Dia", "Previsto", "Entrada", "Status", "Desconto", "Valor", "Justificativa", "Obs. admin"],
      rows: data.map((item) => [
        item.employee_name,
        item.branch_name,
        item.role,
        item.date,
        item.weekday,
        item.expected_work_day ? "Sim" : "Não",
        item.has_start_entry ? "Sim" : "Não",
        item.absence_status,
        item.generates_discount ? "Sim" : "Não",
        formatMoney(item.discount_amount),
        asText(item.justification_text),
        asText(item.admin_observation)
      ]),
      footer
    };
  }

  if (type === "lunch") {
    return {
      title: "Relatório de Almoço",
      subtitle: "Conferência de saída e retorno do almoço, atrasos e intervalos acima do previsto.",
      meta,
      summary: [
        { label: "Dias", value: data.length },
        { label: "Retornos atrasados", value: data.filter((item) => Number(item.lunch_return_delay_minutes || 0) > 0).length },
        { label: "Intervalos acima", value: data.filter((item) => Number(item.lunch_over_minutes || 0) > 0).length },
        { label: "Pendentes", value: data.filter((item) => item.status === "pending_review").length }
      ],
      headers: ["Funcionário", "Filial", "Data", "Saída esp.", "Saída real", "Retorno esp.", "Retorno real", "Atraso retorno", "Intervalo extra", "Status"],
      rows: data.map((item) => [
        item.employee_name,
        item.branch_name,
        item.entry_date,
        asText(item.expected_lunch_start_time),
        asText(item.lunch_start_time),
        asText(item.expected_lunch_end_time),
        asText(item.lunch_end_time),
        minutesToHourText(item.lunch_return_delay_minutes),
        minutesToHourText(item.lunch_over_minutes),
        item.status || "-"
      ]),
      footer
    };
  }

  if (type === "late" || type === "early_leave") {
    const key = type === "late" ? "late_minutes" : "early_leave_minutes";
    return {
      title: type === "late" ? "Relatório de Atrasos" : "Relatório de Saídas Antecipadas",
      subtitle: "Ocorrências acima da tolerância configurada, com justificativa e revisão administrativa.",
      meta,
      summary: [
        { label: "Ocorrências", value: data.length },
        { label: "Total", value: minutesToHourText(data.reduce((sum, item) => sum + Number(item[key] || 0), 0)) },
        { label: "Pendentes", value: data.filter((item) => item.occurrence_review_status === "pending_review").length },
        { label: "Aprovadas", value: data.filter((item) => item.occurrence_review_status === "approved").length }
      ],
      headers: ["Funcionário", "Filial", "Data/Hora", "Previsto", "Registrado", "Minutos", "Revisão", "Justificativa", "Obs. admin"],
      rows: data.map((item) => [
        item.employees?.full_name || "-",
        item.branches?.name || "-",
        formatDateTime(item.entry_timestamp),
        type === "late" ? asText(item.expected_start_time) : asText(item.expected_end_time),
        formatDateTime(item.entry_timestamp),
        item[key],
        item.occurrence_review_status || "-",
        asText(item.justification_text),
        asText(item.occurrence_review_observation)
      ]),
      footer
    };
  }

  if (type === "overtime") {
    return {
      title: "Relatório de Horas Extras",
      subtitle: "Horas extras detectadas e revisadas pelo RH/financeiro.",
      meta,
      summary: [
        { label: "Ocorrências", value: data.length },
        { label: "Calculadas", value: minutesToHourText(data.reduce((sum, item) => sum + Number(item.calculated_overtime_minutes || item.overtime_minutes || 0), 0)) },
        { label: "Aprovadas", value: minutesToHourText(data.reduce((sum, item) => sum + Number(item.approved_overtime_minutes || 0), 0)) },
        { label: "Valor", value: formatMoney(moneySum(data, "overtime_amount")) }
      ],
      headers: ["Funcionário", "Filial", "Data", "Previsto", "Trabalhado", "Extra calc.", "Extra aprovada", "Valor", "Status", "Observação"],
      rows: data.map((item) => [
        item.employees?.full_name || item.employee_name || "-",
        item.branches?.name || item.branch_name || "-",
        item.entry_date || "-",
        minutesToHourText(item.expected_minutes),
        minutesToHourText(item.worked_minutes),
        minutesToHourText(item.calculated_overtime_minutes || item.overtime_minutes),
        minutesToHourText(item.approved_overtime_minutes),
        formatMoney(item.overtime_amount),
        item.status,
        asText(item.admin_observation || item.reviewed_observation)
      ]),
      footer
    };
  }

  if (type === "inconsistencies") {
    return {
      title: "Relatório de Inconsistências",
      subtitle: "Pontos e cadastros que exigem correção ou decisão administrativa.",
      meta,
      summary: [
        { label: "Alertas", value: data.length },
        { label: "Fora do raio", value: data.filter((item) => item.type === "ponto_fora_do_raio").length },
        { label: "Sem encerramento", value: data.filter((item) => item.type === "falta_encerramento").length }
      ],
      headers: ["Funcionário", "Data", "Tipo", "Mensagem"],
      rows: data.map((item) => [item.employee_name || item.employee_id, item.date, item.type, item.message]),
      footer
    };
  }

  if (type === "justifications") {
    return {
      title: "Relatório de Justificativas",
      subtitle: "Solicitações de falta com status, anexo e observação administrativa.",
      meta,
      summary: [
        { label: "Total", value: data.length },
        { label: "Pendentes", value: data.filter((item) => item.status === "pending").length },
        { label: "Aprovadas", value: data.filter((item) => item.status === "approved").length },
        { label: "Rejeitadas", value: data.filter((item) => item.status === "rejected").length }
      ],
      headers: ["Funcionário", "Filial", "Data", "Status", "Justificativa", "Obs. admin", "Anexo"],
      rows: data.map((item) => [
        item.employees?.full_name || "-",
        item.branches?.name || "-",
        item.absence_date,
        item.status,
        item.justification_text,
        asText(item.admin_observation),
        item.attachment_url ? "Sim" : "Não"
      ]),
      footer
    };
  }

  if (type === "employee") {
    return {
      title: "Relatório Individual do Funcionário",
      subtitle: "Visão completa de ponto, faltas, justificativas, horas extras, descontos e valor final do funcionário.",
      meta,
      summary: [
        { label: "Funcionários", value: data.length },
        { label: "Pontos", value: data.reduce((sum, item) => sum + Number(item.total_points || 0), 0) },
        { label: "Faltas", value: data.reduce((sum, item) => sum + Number(item.identified_absences || 0), 0) },
        { label: "Valor final", value: formatMoney(moneySum(data, "final_amount")) }
      ],
      headers: [
        "Funcionário",
        "Filial",
        "Cargo",
        "Contrato",
        "Pontos",
        "Atrasos",
        "Saídas ant.",
        "Faltas",
        "Faltas aprov.",
        "Faltas rej.",
        "Justif. pend.",
        "HE calc.",
        "HE aprov.",
        "Descontos",
        "Acréscimos",
        "Valor final",
        "Ocorrências"
      ],
      rows: data.map((item) => [
        item.employee_name,
        item.branch_name,
        item.role,
        item.employment_type,
        item.total_points,
        minutesToHourText(item.total_late_minutes),
        minutesToHourText(item.total_early_leave_minutes),
        item.identified_absences,
        item.approved_absences,
        item.rejected_absences,
        item.pending_absences,
        minutesToHourText(item.calculated_overtime_minutes),
        minutesToHourText(item.approved_overtime_minutes || item.overtime_minutes),
        formatMoney(item.absence_discount_amount),
        formatMoney(Number(item.overtime_amount || 0) + Number(item.extra_day_amount || 0)),
        formatMoney(item.final_amount),
        item.occurrence_summary || "-"
      ]),
      footer
    };
  }

  if (type === "branch") {
    return {
      title: "Relatório por Filial",
      subtitle: "Resumo operacional e financeiro consolidado por matriz/filial.",
      meta,
      summary: [
        { label: "Filiais", value: data.length },
        { label: "Funcionários", value: data.reduce((sum, item) => sum + Number(item.active_employees || 0), 0) },
        { label: "Ocorrências", value: data.reduce((sum, item) => sum + Number(item.total_occurrences || 0), 0) },
        { label: "Folha total", value: formatMoney(moneySum(data, "payroll_total")) }
      ],
      headers: [
        "Filial",
        "Tipo",
        "Endereço",
        "Funcionários",
        "Pontos",
        "Ausentes/Faltas",
        "Faltas aprov.",
        "Faltas rej.",
        "Atrasos",
        "Saídas ant.",
        "HE aprov.",
        "Justif. pend.",
        "Inconsistências",
        "Folha total",
        "Ranking ocorrências"
      ],
      rows: data.map((item) => [
        item.branch_name,
        item.branch_type,
        item.address,
        item.active_employees,
        item.total_points,
        item.identified_absences,
        item.approved_absences,
        item.rejected_absences,
        minutesToHourText(item.total_late_minutes),
        minutesToHourText(item.total_early_leave_minutes),
        minutesToHourText(item.approved_overtime_minutes),
        item.pending_justifications,
        item.inconsistencies,
        formatMoney(item.payroll_total),
        item.ranking || "-"
      ]),
      footer
    };
  }

  if (type === "payroll" && format === "pdf") {
    return {
      title: "Pré-folha e Conferência de Jornada",
      subtitle: "Conferência oficial da remuneração por funcionário, com resumo financeiro e valores finais.",
      meta,
      summary: [
        { label: "Funcionários", value: data.length },
        { label: "Líquido", value: formatMoney(moneySum(data, "final_amount")) },
        { label: "Descontos", value: formatMoney(moneySum(data, "absence_discount_amount")) },
        { label: "Acréscimos", value: formatMoney(data.reduce((sum, item) => sum + Number(item.overtime_amount || 0) + Number(item.extra_day_amount || 0), 0)) }
      ],
      headers: [
        "Funcionário",
        "Unidade",
        "Prev.",
        "Trab.",
        "Faltas",
        "Atraso/HE",
        "Descontos",
        "Líquido"
      ],
      rows: data.map((item) => [
        item.employee_name,
        compactBranchName(item.branch_name),
        item.expected_work_days,
        item.worked_days,
        item.discounted_absences,
        `${minutesToHourText(item.total_late_minutes)} / ${minutesToHourText(item.approved_overtime_minutes || item.overtime_minutes)}`,
        compactMoney(item.absence_discount_amount),
        compactMoney(item.final_amount)
      ]),
      footer
    };
  }

  return {
    title: type === "payroll" ? "Pré-folha e Conferência de Jornada" : "Relatório de Pré-folha e Jornada",
    subtitle: type === "payroll" ? "Consolidado de remuneração com descontos, acréscimos, Pix e dados bancários." : "Consolidado financeiro com descontos, acréscimos, Pix e dados bancários.",
    meta,
    summary: [
      { label: "Funcionários", value: data.length },
      { label: "Total final", value: formatMoney(moneySum(data, "final_amount")) },
      { label: "Descontos", value: formatMoney(moneySum(data, "absence_discount_amount")) },
      { label: "Acréscimos", value: formatMoney(data.reduce((sum, item) => sum + Number(item.overtime_amount || 0) + Number(item.extra_day_amount || 0), 0)) }
    ],
    headers: [
      "Funcionário",
      "Filial",
      "Cargo",
      "Contrato",
      "Status folha",
      "Salário base",
      "Diária",
      "Dias previstos",
      "Dias trabalhados",
      "Faltas aprov.",
      "Faltas desc.",
      "Atrasos",
      "Saídas ant.",
      "HE aprovada",
      "Descontos",
      "Acréscimos",
      "Valor final",
      "Pix",
      "Banco",
      "Agência",
      "Conta",
      "Observações"
    ],
    rows: data.map((item) => [
      item.employee_name,
      item.branch_name,
      item.role,
      item.employment_type,
      item.payroll_periods?.status || item.status || "-",
      formatMoney(item.base_salary),
      formatMoney(item.daily_rate),
      item.expected_work_days,
      item.worked_days,
      item.approved_absences,
      item.discounted_absences,
      minutesToHourText(item.total_late_minutes),
      minutesToHourText(item.total_early_leave_minutes),
      minutesToHourText(item.approved_overtime_minutes || item.overtime_minutes),
      formatMoney(item.absence_discount_amount),
      formatMoney(Number(item.overtime_amount || 0) + Number(item.extra_day_amount || 0)),
      formatMoney(item.final_amount),
      asText(item.pix_key),
      asText(item.bank_name),
      asText(item.bank_agency),
      [item.bank_account, item.bank_account_type].filter(Boolean).join(" / ") || "-",
      asText(item.notes)
    ]),
    footer
  };

}

async function loadAbsenceRows(auth: Awaited<ReturnType<typeof requireAdmin>> & any, params: URLSearchParams) {
  const startDate = params.get("startDate") || new Date().toISOString().slice(0, 8) + "01";
  const endDate = params.get("endDate") || new Date().toISOString().slice(0, 10);
  let employeesQuery = scopeByBranch(auth.supabase.from("employees").select("*, branches:branches!employees_branch_id_fkey(name)").eq("active", true).order("full_name"), auth.context, "branch_id");
  if (params.get("branchId")) employeesQuery = employeesQuery.eq("branch_id", params.get("branchId"));
  if (params.get("employeeId")) employeesQuery = employeesQuery.eq("id", params.get("employeeId"));
  if (params.get("role")) employeesQuery = employeesQuery.ilike("role", `%${params.get("role")}%`);
  const [{ data: employees, error: employeesError }, { data: entries, error: entriesError }, { data: justifications, error: justificationsError }] =
    await Promise.all([
      employeesQuery,
      scopeByBranch(auth.supabase.from("time_entries").select("*").gte("entry_date", startDate).lte("entry_date", endDate), auth.context, "branch_id"),
      scopeByBranch(auth.supabase.from("absence_justifications").select("*").gte("absence_date", startDate).lte("absence_date", endDate), auth.context, "branch_id")
    ]);
  if (employeesError) throw new Error(employeesError.message);
  if (entriesError) throw new Error(entriesError.message);
  if (justificationsError) throw new Error(justificationsError.message);
  const settings = await getSystemSettings(auth.supabase);
  const { schedules, holidays } = await fetchScheduleContext({
    supabase: auth.supabase,
    employeeIds: (employees || []).map((employee: any) => employee.id),
    branchIds: [...new Set((employees || []).map((employee: any) => employee.branch_id))] as string[],
    startDate,
    endDate
  });
  let rows = buildAbsenceReport({
    employees: (employees || []) as any,
    entries: (entries || []) as any,
    justifications: justifications || [],
    schedules,
    holidays,
    settings,
    startDate,
    endDate
  });
  if (params.get("status")) rows = rows.filter((row) => row.absence_status === params.get("status"));
  if (params.get("discountStatus") === "with_discount") rows = rows.filter((row) => row.generates_discount);
  if (params.get("discountStatus") === "without_discount") rows = rows.filter((row) => !row.generates_discount);
  return rows.filter((row) => row.expected_work_day || row.absence_status !== "not_absent");
}

async function loadEmployeeReportRows(auth: Awaited<ReturnType<typeof requireAdmin>> & any, params: URLSearchParams) {
  const startDate = params.get("startDate") || new Date().toISOString().slice(0, 8) + "01";
  const endDate = params.get("endDate") || new Date().toISOString().slice(0, 10);
  const [employeesRes, entriesRes, justificationsRes, overtimeRes, payrollRes] = await Promise.all([
    scopeByBranch(auth.supabase.from("employees").select("id, full_name, role, employment_type, branch_id, branches:branches!employees_branch_id_fkey(name)").eq("active", true), auth.context, "branch_id"),
    scopeByBranch(auth.supabase.from("time_entries").select("*").gte("entry_date", startDate).lte("entry_date", endDate), auth.context, "branch_id"),
    scopeByBranch(auth.supabase.from("absence_justifications").select("*").gte("absence_date", startDate).lte("absence_date", endDate), auth.context, "branch_id"),
    scopeByBranch(auth.supabase.from("overtime_reviews").select("*").gte("entry_date", startDate).lte("entry_date", endDate), auth.context, "branch_id"),
    scopeByBranch(auth.supabase.from("payroll_items").select("*, payroll_periods!inner(start_date,end_date,status)").gte("payroll_periods.start_date", startDate).lte("payroll_periods.end_date", endDate), auth.context, "branch_id")
  ]);
  for (const response of [employeesRes, entriesRes, justificationsRes, overtimeRes, payrollRes]) {
    if (response.error) throw new Error(response.error.message);
  }
  let employees = employeesRes.data || [];
  if (params.get("employeeId")) employees = employees.filter((employee: any) => employee.id === params.get("employeeId"));
  if (params.get("branchId")) employees = employees.filter((employee: any) => employee.branch_id === params.get("branchId"));
  if (params.get("role")) employees = employees.filter((employee: any) => String(employee.role || "").toLowerCase().includes(String(params.get("role")).toLowerCase()));
  if (params.get("employmentType")) employees = employees.filter((employee: any) => employee.employment_type === params.get("employmentType"));

  return employees.map((employee: any) => {
    const entries = (entriesRes.data || []).filter((entry: any) => entry.employee_id === employee.id);
    const justifications = (justificationsRes.data || []).filter((item: any) => item.employee_id === employee.id);
    const overtime = (overtimeRes.data || []).filter((item: any) => item.employee_id === employee.id);
    const payrollItems = (payrollRes.data || []).filter((item: any) => item.employee_id === employee.id);
    const payroll = payrollItems.reduce(
      (acc: any, item: any) => ({
        final_amount: acc.final_amount + Number(item.final_amount || 0),
        absence_discount_amount: acc.absence_discount_amount + Number(item.absence_discount_amount || 0),
        overtime_amount: acc.overtime_amount + Number(item.overtime_amount || 0),
        extra_day_amount: acc.extra_day_amount + Number(item.extra_day_amount || 0),
        identified_absences: acc.identified_absences + Number(item.identified_absences || item.discounted_absences || 0),
        approved_absences: acc.approved_absences + Number(item.approved_absences || 0),
        rejected_absences: acc.rejected_absences + Number(item.rejected_absences || 0),
        pending_absences: acc.pending_absences + Number(item.pending_absences || 0)
      }),
      { final_amount: 0, absence_discount_amount: 0, overtime_amount: 0, extra_day_amount: 0, identified_absences: 0, approved_absences: 0, rejected_absences: 0, pending_absences: 0 }
    );
    const late = entries.reduce((sum: number, entry: any) => sum + Number(entry.late_minutes || 0), 0);
    const early = entries.reduce((sum: number, entry: any) => sum + Number(entry.early_leave_minutes || 0), 0);
    const calculatedOvertime = overtime.reduce((sum: number, item: any) => sum + Number(item.calculated_overtime_minutes || item.overtime_minutes || 0), 0);
    const approvedOvertime = overtime.reduce((sum: number, item: any) => sum + Number(item.approved_overtime_minutes || (item.status === "approved" || item.status === "adjusted" ? item.overtime_minutes : 0) || 0), 0);
    const occurrenceCount = entries.filter((entry: any) => entry.status !== "valid" || entry.late_minutes > 0 || entry.early_leave_minutes > 0 || !entry.inside_allowed_radius).length;
    return {
      employee_id: employee.id,
      employee_name: employee.full_name,
      branch_id: employee.branch_id,
      branch_name: employee.branches?.name || "-",
      role: employee.role,
      employment_type: employee.employment_type,
      total_points: entries.length,
      total_late_minutes: late,
      total_early_leave_minutes: early,
      identified_absences: payroll.identified_absences,
      approved_absences: payroll.approved_absences + justifications.filter((item: any) => item.status === "approved").length,
      rejected_absences: payroll.rejected_absences + justifications.filter((item: any) => item.status === "rejected").length,
      pending_absences: payroll.pending_absences + justifications.filter((item: any) => item.status === "pending").length,
      calculated_overtime_minutes: calculatedOvertime,
      approved_overtime_minutes: approvedOvertime,
      absence_discount_amount: payroll.absence_discount_amount,
      overtime_amount: payroll.overtime_amount,
      extra_day_amount: payroll.extra_day_amount,
      final_amount: payroll.final_amount,
      occurrence_summary: `${occurrenceCount} ocorrência(s), ${justifications.length} justificativa(s), ${overtime.length} HE`
    };
  });
}

async function loadBranchReportRows(auth: Awaited<ReturnType<typeof requireAdmin>> & any, params: URLSearchParams) {
  const startDate = params.get("startDate") || new Date().toISOString().slice(0, 8) + "01";
  const endDate = params.get("endDate") || new Date().toISOString().slice(0, 10);
  const [branchesRes, employeesRes, entriesRes, justificationsRes, overtimeRes, payrollRes] = await Promise.all([
    scopeByBranch(auth.supabase.from("branches").select("*").eq("active", true).order("name"), auth.context, "id"),
    scopeByBranch(auth.supabase.from("employees").select("id, full_name, role, branch_id, active").eq("active", true), auth.context, "branch_id"),
    scopeByBranch(auth.supabase.from("time_entries").select("*").gte("entry_date", startDate).lte("entry_date", endDate), auth.context, "branch_id"),
    scopeByBranch(auth.supabase.from("absence_justifications").select("*").gte("absence_date", startDate).lte("absence_date", endDate), auth.context, "branch_id"),
    scopeByBranch(auth.supabase.from("overtime_reviews").select("*, employees(full_name)").gte("entry_date", startDate).lte("entry_date", endDate), auth.context, "branch_id"),
    scopeByBranch(auth.supabase.from("payroll_items").select("*, payroll_periods!inner(start_date,end_date,status)").gte("payroll_periods.start_date", startDate).lte("payroll_periods.end_date", endDate), auth.context, "branch_id")
  ]);
  for (const response of [branchesRes, employeesRes, entriesRes, justificationsRes, overtimeRes, payrollRes]) {
    if (response.error) throw new Error(response.error.message);
  }
  let branches = branchesRes.data || [];
  if (params.get("branchId")) branches = branches.filter((branch: any) => branch.id === params.get("branchId"));
  return branches.map((branch: any) => {
    const employees = (employeesRes.data || []).filter((employee: any) => employee.branch_id === branch.id);
    const entries = (entriesRes.data || []).filter((entry: any) => entry.branch_id === branch.id);
    const justifications = (justificationsRes.data || []).filter((item: any) => item.branch_id === branch.id);
    const overtime = (overtimeRes.data || []).filter((item: any) => item.branch_id === branch.id);
    const payroll = (payrollRes.data || []).filter((item: any) => item.branch_id === branch.id);
    const occurrenceByEmployee = new Map<string, { name: string; count: number }>();
    entries.forEach((entry: any) => {
      if (entry.status !== "valid" || entry.late_minutes > 0 || entry.early_leave_minutes > 0 || !entry.inside_allowed_radius) {
        const employee = employees.find((item: any) => item.id === entry.employee_id);
        const current = occurrenceByEmployee.get(entry.employee_id) || { name: employee?.full_name || entry.employee_id, count: 0 };
        current.count += 1;
        occurrenceByEmployee.set(entry.employee_id, current);
      }
    });
    const ranking = [...occurrenceByEmployee.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map((item) => `${item.name}: ${item.count}`)
      .join(" | ");
    return {
      branch_id: branch.id,
      branch_name: branch.name,
      branch_type: branch.type,
      address: branch.address,
      active_employees: employees.length,
      total_points: entries.length,
      identified_absences: payroll.reduce((sum: number, item: any) => sum + Number(item.identified_absences || item.discounted_absences || 0), 0),
      approved_absences: payroll.reduce((sum: number, item: any) => sum + Number(item.approved_absences || 0), 0),
      rejected_absences: payroll.reduce((sum: number, item: any) => sum + Number(item.rejected_absences || 0), 0),
      total_late_minutes: entries.reduce((sum: number, item: any) => sum + Number(item.late_minutes || 0), 0),
      total_early_leave_minutes: entries.reduce((sum: number, item: any) => sum + Number(item.early_leave_minutes || 0), 0),
      approved_overtime_minutes: overtime.reduce((sum: number, item: any) => sum + Number(item.approved_overtime_minutes || (item.status === "approved" || item.status === "adjusted" ? item.overtime_minutes : 0) || 0), 0),
      pending_justifications: justifications.filter((item: any) => item.status === "pending").length,
      inconsistencies: entries.filter((entry: any) => entry.status !== "valid" || entry.occurrence_review_status === "pending_review" || !entry.inside_allowed_radius).length,
      total_occurrences: entries.filter((entry: any) => entry.status !== "valid" || entry.late_minutes > 0 || entry.early_leave_minutes > 0 || !entry.inside_allowed_radius).length,
      payroll_total: payroll.reduce((sum: number, item: any) => sum + Number(item.final_amount || 0), 0),
      ranking
    };
  });
}


async function loadLunchReportRows(auth: Awaited<ReturnType<typeof requireAdmin>> & any, params: URLSearchParams) {
  const startDate = params.get("startDate") || new Date().toISOString().slice(0, 8) + "01";
  const endDate = params.get("endDate") || new Date().toISOString().slice(0, 10);
  let query = scopeByBranch(auth.supabase
    .from("time_entries")
    .select("*, employees(full_name, expected_lunch_start_time, expected_lunch_end_time, expected_lunch_minutes), branches:branches!time_entries_branch_id_fkey(name)")
    .in("action", ["start_lunch", "end_lunch"])
    .gte("entry_date", startDate)
    .lte("entry_date", endDate)
    .order("entry_timestamp", { ascending: true })
    .limit(5001), auth.context, "branch_id");
  if (params.get("branchId")) query = query.eq("branch_id", params.get("branchId"));
  if (params.get("employeeId")) query = query.eq("employee_id", params.get("employeeId"));
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const groups = new Map<string, any[]>();
  (data || []).forEach((entry: any) => {
    const key = `${entry.employee_id}:${entry.entry_date}`;
    groups.set(key, [...(groups.get(key) || []), entry]);
  });
  return [...groups.values()].map((entries) => {
    const start = entries.find((entry) => entry.action === "start_lunch");
    const end = entries.find((entry) => entry.action === "end_lunch");
    const ref = start || end || entries[0];
    return {
      employee_name: ref.employees?.full_name || "-",
      branch_name: ref.branches?.name || "-",
      entry_date: ref.entry_date,
      expected_lunch_start_time: ref.employees?.expected_lunch_start_time || ref.expected_lunch_start_time || null,
      expected_lunch_end_time: ref.employees?.expected_lunch_end_time || ref.expected_lunch_end_time || null,
      lunch_start_time: start?.entry_timestamp ? formatDateTime(start.entry_timestamp) : "-",
      lunch_end_time: end?.entry_timestamp ? formatDateTime(end.entry_timestamp) : "-",
      lunch_return_delay_minutes: end?.schedule_compliance_status === "lunch_late"
        ? Math.max(0, Number(end?.lunch_variation_minutes ?? 0))
        : 0,
      lunch_over_minutes: end?.schedule_compliance_status === "lunch_long"
        ? Math.max(0, Number(end?.lunch_variation_minutes ?? 0))
        : 0,
      status: entries.some((entry) => entry.status === "pending_review") ? "pending_review" : "valid"
    };
  });
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  try {
    const params = request.nextUrl.searchParams;
    const type = params.get("type") || "points";
    const format = params.get("format") || "json";
    if (params.get("branchId") && !canAccessBranch(auth.context, params.get("branchId"))) return fail("Você não tem acesso a esta filial.", 403);
    const financialAllowed = canViewFinancialData(auth.context);
    const financialTypes = new Set(["payroll"]);
    if (financialTypes.has(type) && !financialAllowed) return fail("Você não tem permissão para gerar relatórios financeiros.", 403);
    const settings = await getSystemSettings(auth.supabase);
    const meta = [
      params.get("startDate") || params.get("endDate") ? `Período: ${params.get("startDate") || "início"} até ${params.get("endDate") || "fim"}` : "Período: conforme filtros",
      params.get("branchId") ? `Filial filtrada: ${params.get("branchId")}` : "Filiais: todas",
      params.get("employeeId") ? `Funcionário filtrado: ${params.get("employeeId")}` : "Funcionários: todos",
      params.get("paymentDay") ? `Dia de pagamento: ${params.get("paymentDay")}` : "Dia de pagamento: todos"
    ];

    let data: any[] = [];

    if (type === "absences") {
      data = await loadAbsenceRows(auth as any, params);
    } else if (type === "employee") {
      data = await loadEmployeeReportRows(auth as any, params);
    } else if (type === "lunch") {
      data = await loadLunchReportRows(auth as any, params);
    } else if (type === "branch" || type === "executive") {
      data = await loadBranchReportRows(auth as any, params);
    } else if (["points", "late", "early_leave"].includes(type)) {
      let query = scopeByBranch(auth.supabase
        .from("time_entries")
        .select("*, employees(full_name, role), branches:branches!time_entries_branch_id_fkey(name)")
        .order("entry_timestamp", { ascending: false })
        .limit(5001), auth.context, "branch_id");
      if (type === "late") query = query.gt("late_minutes", 0);
      if (type === "early_leave") query = query.gt("early_leave_minutes", 0);
      if (params.get("branchId")) query = query.eq("branch_id", params.get("branchId"));
      if (params.get("employeeId")) query = query.eq("employee_id", params.get("employeeId"));
      if (params.get("status")) query = query.eq("status", params.get("status"));
      if (params.get("action")) query = query.eq("action", params.get("action"));
      if (params.get("startDate")) query = query.gte("entry_date", params.get("startDate"));
      if (params.get("endDate")) query = query.lte("entry_date", params.get("endDate"));
      const { data: rows, error } = await query;
      if (error) throw new Error(error.message);
      data = rows || [];
    } else if (type === "overtime") {
      let query = scopeByBranch(auth.supabase.from("overtime_reviews").select("*, employees(full_name, role), branches:branches!overtime_reviews_branch_id_fkey(name)").order("entry_date", { ascending: false }).limit(5001), auth.context, "branch_id");
      if (params.get("branchId")) query = query.eq("branch_id", params.get("branchId"));
      if (params.get("employeeId")) query = query.eq("employee_id", params.get("employeeId"));
      if (params.get("status")) query = query.eq("status", params.get("status"));
      if (params.get("startDate")) query = query.gte("entry_date", params.get("startDate"));
      if (params.get("endDate")) query = query.lte("entry_date", params.get("endDate"));
      const { data: rows, error } = await query;
      if (error) throw new Error(error.message);
      data = rows || [];
    } else if (type === "justifications") {
      let query = scopeByBranch(auth.supabase.from("absence_justifications").select("*, employees(full_name, role), branches:branches!absence_justifications_branch_id_fkey(name)").order("absence_date", { ascending: false }).limit(5001), auth.context, "branch_id");
      if (params.get("branchId")) query = query.eq("branch_id", params.get("branchId"));
      if (params.get("employeeId")) query = query.eq("employee_id", params.get("employeeId"));
      if (params.get("status")) query = query.eq("status", params.get("status"));
      if (params.get("startDate")) query = query.gte("absence_date", params.get("startDate"));
      if (params.get("endDate")) query = query.lte("absence_date", params.get("endDate"));
      const { data: rows, error } = await query;
      if (error) throw new Error(error.message);
      data = rows || [];
    } else if (type === "inconsistencies") {
      let query = scopeByBranch(auth.supabase.from("time_entries").select("*, employees(full_name, role), branches:branches!time_entries_branch_id_fkey(name)").order("entry_timestamp", { ascending: true }).limit(5001), auth.context, "branch_id");
      if (params.get("branchId")) query = query.eq("branch_id", params.get("branchId"));
      if (params.get("employeeId")) query = query.eq("employee_id", params.get("employeeId"));
      if (params.get("startDate")) query = query.gte("entry_date", params.get("startDate"));
      if (params.get("endDate")) query = query.lte("entry_date", params.get("endDate"));
      const { data: rows, error } = await query;
      if (error) throw new Error(error.message);
      data = analyzeInconsistencies((rows || []) as any).map((item) => ({
        ...item,
        employee_name: (rows || []).find((entry: any) => entry.id === item.entry_id)?.employees?.full_name || item.employee_id
      }));
    } else {
      let query = scopeByBranch(auth.supabase.from("payroll_items").select("*, payroll_periods!inner(title,start_date,end_date,status,payment_day,branch_id)").order("employee_name", { ascending: true }).limit(5001), auth.context, "branch_id");
      if (params.get("payrollId")) query = query.eq("payroll_period_id", params.get("payrollId"));
      if (params.get("branchId")) query = query.eq("branch_id", params.get("branchId"));
      if (params.get("employeeId")) query = query.eq("employee_id", params.get("employeeId"));
      if (params.get("paymentDay")) query = query.eq("payroll_periods.payment_day", Number(params.get("paymentDay")));
      if (params.get("startDate")) query = query.gte("payroll_periods.start_date", params.get("startDate"));
      if (params.get("endDate")) query = query.lte("payroll_periods.end_date", params.get("endDate"));
      if (params.get("role")) query = query.ilike("role", `%${params.get("role")}%`);
      if (params.get("employmentType")) query = query.eq("employment_type", params.get("employmentType"));
      const { data: rows, error } = await query;
      if (error) throw new Error(error.message);
      data = rows || [];
    }

    if (data.length >= 5001) {
      return fail("O relatório excede 5.000 registros. Reduza o período ou aplique filtros de filial e colaborador.", 413);
    }

    if (!financialAllowed) {
      data = data.map((item) => ({
        ...item,
        pix_key: null,
        bank_name: null,
        bank_agency: null,
        bank_account: null,
        bank_account_type: null,
        base_salary: 0,
        daily_rate: 0,
        absence_discount_amount: 0,
        overtime_amount: 0,
        extra_day_amount: 0,
        final_amount: 0,
        payroll_total: 0
      }));
    }

    const table = buildTable(type, data, settings.report_footer, meta, format);
    table.branding = await getTenantExportBranding(auth.rawSupabase, auth.context.tenantId, auth.context.tenantName);
    table.footer = table.branding.footer || table.footer;
    if (type === "payroll" && data.some((item: any) => item.payroll_periods?.status === "incomplete_preview" || item.period_status_snapshot === "incomplete_preview")) {
      table.meta = [
        "PRÉVIA INCOMPLETA — NÃO USAR PARA PAGAMENTO SEM CONFERÊNCIA",
        ...(table.meta || [])
      ];
      table.summary = [
        ...(table.summary || []),
        { label: "Status", value: "Prévia incompleta" }
      ];
    }
    if (format === "pdf" && data.length > Number(settings.payroll_pdf_block_rows || 1500)) {
      return fail("Este relatório tem muitos registros para PDF detalhado. Use Excel ou aplique filtros menores.", 413);
    }
    if (format === "pdf" && data.length > Number(settings.payroll_pdf_max_detailed_rows || 300)) {
      table.summary = [...(table.summary || []), { label: "Aviso", value: "PDF resumido: use Excel para auditoria completa" }];
    }
    if (format === "pdf") {
      await writeAuditLog({ supabase: auth.supabase, context: auth.context, action: "export_pdf", entity: "reports", newData: { type, filters: Object.fromEntries(params.entries()), rows: data.length, financial: financialAllowed, ip: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip"), userAgent: request.headers.get("user-agent") } });
      const { createPdfBuffer, fileResponse } = await import("@/lib/server/exporters");
      return fileResponse(await createPdfBuffer(table), `${type}.pdf`, "application/pdf");
    }
    if (format === "xlsx") {
      await writeAuditLog({ supabase: auth.supabase, context: auth.context, action: "export_xlsx", entity: "reports", newData: { type, filters: Object.fromEntries(params.entries()), rows: data.length, financial: financialAllowed, ip: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip"), userAgent: request.headers.get("user-agent") } });
      const { createXlsxBuffer, fileResponse } = await import("@/lib/server/exporters");
      return fileResponse(await createXlsxBuffer(table), `${type}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    }
    return ok({ rows: data, table });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Erro ao gerar relatório.", 500);
  }
}
