import ExcelJS from "exceljs";
import { createPdfBuffer, type ExportBranding, type ExportTable } from "@/lib/server/exporters";
import { centsToString, moneyToCents, sumCents } from "@/lib/services/money-v51";

export type ProfessionalReportRunV51 = {
  id: string;
  version: number;
  status: string;
  summary: Record<string, unknown>;
  integrity_hash?: string | null;
  created_at: string;
};
export type ProfessionalReportPeriodV51 = { title: string; start_date: string; end_date: string; branch_id: string | null };
export type ProfessionalReportEmployeeV51 = { id: string; full_name: string; registration_code: string | null; branch_id: string; role: string };
export type ProfessionalReportRubricV51 = { employee_id: string; rubric_code: string; rubric_name: string; rubric_type: string; final_value: number | string; formula_snapshot: Record<string, unknown> };
export type ProfessionalReportDivergenceV51 = { employee_id: string | null; code: string; severity: string; message: string; status: string };
export type ProfessionalReportApprovalV51 = { approval_stage: string; decision: string; reason: string | null; approved_at: string };

function money(value: unknown) {
  const normalized = centsToString(moneyToCents(typeof value === "string" || typeof value === "number" ? value : 0));
  return Number(normalized).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function sumMoney(values: Array<string | number>) {
  return centsToString(sumCents(values.map((value) => moneyToCents(value))));
}

function summarizeEmployees(employees: ProfessionalReportEmployeeV51[], rubrics: ProfessionalReportRubricV51[], divergences: ProfessionalReportDivergenceV51[]) {
  return employees.map((employee) => {
    const rows = rubrics.filter((rubric) => rubric.employee_id === employee.id);
    const earnings = sumMoney(rows.filter((row) => row.rubric_type === "earning").map((row) => row.final_value));
    const deductions = sumMoney(rows.filter((row) => row.rubric_type === "deduction").map((row) => row.final_value));
    const employerCharges = sumMoney(rows.filter((row) => row.rubric_type === "employer_charge").map((row) => row.final_value));
    const net = centsToString(moneyToCents(earnings) - moneyToCents(deductions));
    const critical = divergences.filter((item) => item.employee_id === employee.id && item.severity === "critical" && !["resolved", "accepted_exception"].includes(item.status)).length;
    return { ...employee, earnings, deductions, net, employerCharges, critical };
  });
}

export async function createProfessionalPayrollPdfV51(params: {
  run: ProfessionalReportRunV51;
  period: ProfessionalReportPeriodV51;
  employees: ProfessionalReportEmployeeV51[];
  rubrics: ProfessionalReportRubricV51[];
  divergences: ProfessionalReportDivergenceV51[];
  branding: ExportBranding;
}) {
  const rows = summarizeEmployees(params.employees, params.rubrics, params.divergences);
  const table: ExportTable = {
    title: "Pré-folha e conferência de jornada",
    subtitle: `Modo de simulação e homologação · ${params.period.start_date} a ${params.period.end_date}`,
    meta: [`Competência: ${params.period.title}`, `Versão: ${params.run.version}`, `Status: ${params.run.status}`, `Hash: ${params.run.integrity_hash || "não fechado"}`],
    summary: [
      { label: "Funcionários", value: rows.length },
      { label: "Proventos", value: money(sumMoney(rows.map((row) => row.earnings))) },
      { label: "Descontos", value: money(sumMoney(rows.map((row) => row.deductions))) },
      { label: "Líquido", value: money(sumMoney(rows.map((row) => row.net))) },
    ],
    headers: ["Funcionário", "Matrícula", "Cargo", "Proventos", "Descontos", "Líquido", "Encargos", "Pendências críticas"],
    rows: rows.map((row) => [row.full_name, row.registration_code || "-", row.role, money(row.earnings), money(row.deductions), money(row.net), money(row.employerCharges), row.critical]),
    footer: params.branding.footer || "NexPonto · Documento administrativo para simulação e homologação",
    branding: params.branding,
  };
  return createPdfBuffer(table);
}

function styleSheet(sheet: ExcelJS.Worksheet, headerRow = 1) {
  sheet.views = [{ state: "frozen", ySplit: headerRow }];
  sheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: Math.max(1, sheet.columnCount) } };
  const header = sheet.getRow(headerRow);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B2D61" } };
  header.height = 24;
  sheet.eachRow((row, rowNumber) => {
    row.alignment = { vertical: "middle", wrapText: true };
    if (rowNumber > headerRow && rowNumber % 2 === 0) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F8FC" } };
  });
  sheet.columns.forEach((column) => { column.width = Math.min(42, Math.max(12, Number(column.width || 12))); });
}

export async function createProfessionalPayrollXlsxV51(params: {
  run: ProfessionalReportRunV51;
  period: ProfessionalReportPeriodV51;
  employees: ProfessionalReportEmployeeV51[];
  rubrics: ProfessionalReportRubricV51[];
  divergences: ProfessionalReportDivergenceV51[];
  approvals: ProfessionalReportApprovalV51[];
}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "NexPonto";
  workbook.created = new Date();
  const rows = summarizeEmployees(params.employees, params.rubrics, params.divergences);

  const summary = workbook.addWorksheet("Resumo");
  summary.addRow(["Pré-folha e conferência de jornada — modo de simulação e homologação"]);
  summary.mergeCells("A1:D1");
  summary.getCell("A1").font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  summary.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF07162F" } };
  summary.addRows([
    ["Competência", params.period.title], ["Período", `${params.period.start_date} a ${params.period.end_date}`], ["Versão", params.run.version], ["Status", params.run.status], ["Hash", params.run.integrity_hash || "não fechado"],
    ["Funcionários", rows.length], ["Proventos", Number(sumMoney(rows.map((row) => row.earnings)))], ["Descontos", Number(sumMoney(rows.map((row) => row.deductions)))], ["Líquido", Number(sumMoney(rows.map((row) => row.net)))],
  ]);
  summary.getColumn(1).width = 24; summary.getColumn(2).width = 42;
  [8,9,10].forEach((rowNumber) => { summary.getCell(rowNumber, 2).numFmt = 'R$ #,##0.00;[Red]-R$ #,##0.00'; });

  const payroll = workbook.addWorksheet("Folha");
  payroll.addRow(["Funcionário", "Matrícula", "Cargo", "Proventos", "Descontos", "Líquido", "Encargos", "Pendências críticas"]);
  rows.forEach((row) => payroll.addRow([row.full_name, row.registration_code || "", row.role, Number(row.earnings), Number(row.deductions), Number(row.net), Number(row.employerCharges), row.critical]));
  [4,5,6,7].forEach((column) => payroll.getColumn(column).numFmt = 'R$ #,##0.00;[Red]-R$ #,##0.00');
  payroll.getColumn(1).width = 34; payroll.getColumn(2).width = 16; payroll.getColumn(3).width = 24;
  styleSheet(payroll);

  const rubricSheet = workbook.addWorksheet("Rubricas");
  rubricSheet.addRow(["Funcionário", "Código", "Rubrica", "Tipo", "Valor", "Memória"]);
  const employeeMap = new Map(params.employees.map((employee) => [employee.id, employee]));
  params.rubrics.forEach((rubric) => rubricSheet.addRow([employeeMap.get(rubric.employee_id)?.full_name || rubric.employee_id, rubric.rubric_code, rubric.rubric_name, rubric.rubric_type, Number(rubric.final_value || 0), JSON.stringify(rubric.formula_snapshot || {})]));
  rubricSheet.getColumn(5).numFmt = 'R$ #,##0.00;[Red]-R$ #,##0.00'; rubricSheet.getColumn(1).width = 34; rubricSheet.getColumn(3).width = 30; rubricSheet.getColumn(6).width = 60;
  styleSheet(rubricSheet);

  const pending = workbook.addWorksheet("Pendências");
  pending.addRow(["Funcionário", "Código", "Severidade", "Mensagem", "Status"]);
  params.divergences.forEach((item) => pending.addRow([item.employee_id ? employeeMap.get(item.employee_id)?.full_name || item.employee_id : "Geral", item.code, item.severity, item.message, item.status]));
  pending.getColumn(1).width = 34; pending.getColumn(2).width = 32; pending.getColumn(4).width = 70;
  styleSheet(pending);

  const approvals = workbook.addWorksheet("Auditoria");
  approvals.addRow(["Etapa", "Decisão", "Motivo", "Data"]);
  params.approvals.forEach((approval) => approvals.addRow([approval.approval_stage, approval.decision, approval.reason || "", approval.approved_at]));
  approvals.getColumn(1).width = 20; approvals.getColumn(3).width = 60; approvals.getColumn(4).width = 28;
  styleSheet(approvals);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
