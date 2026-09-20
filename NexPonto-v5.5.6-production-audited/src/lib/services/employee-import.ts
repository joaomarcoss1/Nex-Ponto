import ExcelJS from "exceljs";
import crypto from "crypto";
import { formatMoney } from "@/lib/format";
import type { ExportTable } from "@/lib/server/exporters";

export type ImportRow = {
  rowNumber: number;
  registration_code?: string;
  full_name: string;
  document?: string;
  phone?: string;
  role: string;
  sector?: string;
  branch_name: string;
  branch_id?: string;
  employment_type: string;
  monthly_salary?: number;
  daily_rate?: number | null;
  daily_rate_mode?: string;
  pix_key?: string;
  bank_name?: string;
  bank_agency?: string;
  bank_account?: string;
  admission_date?: string;
  status?: string;
  work_days?: number[];
  payment_day?: number | null;
  expected_start_time?: string;
  expected_lunch_start_time?: string | null;
  expected_lunch_end_time?: string | null;
  expected_end_time?: string;
  pin?: string;
  generated_pin?: string;
  action?: "create" | "update" | "skip";
  errors: string[];
  warnings: string[];
};

const headerAliases: Record<string, keyof ImportRow | "ignore"> = {
  matricula: "registration_code",
  matrícula: "registration_code",
  codigo: "registration_code",
  código: "registration_code",
  registration_code: "registration_code",
  nome: "full_name",
  nome_completo: "full_name",
  funcionario: "full_name",
  funcionário: "full_name",
  cpf: "document",
  documento: "document",
  telefone: "phone",
  cargo: "role",
  funcao: "role",
  função: "role",
  setor: "sector",
  filial: "branch_name",
  unidade: "branch_name",
  branch: "branch_name",
  tipo_contratacao: "employment_type",
  contrato: "employment_type",
  employment_type: "employment_type",
  salario: "monthly_salary",
  salário: "monthly_salary",
  salario_mensal: "monthly_salary",
  diaria: "daily_rate",
  diária: "daily_rate",
  valor_diaria: "daily_rate",
  forma_calculo: "daily_rate_mode",
  calculo_diaria: "daily_rate_mode",
  pix: "pix_key",
  chave_pix: "pix_key",
  banco: "bank_name",
  agencia: "bank_agency",
  agência: "bank_agency",
  conta: "bank_account",
  data_admissao: "admission_date",
  admissao: "admission_date",
  admissão: "admission_date",
  escala: "work_days",
  dias_trabalho: "work_days",
  dia_pagamento: "payment_day",
  pagamento: "payment_day",
  entrada: "expected_start_time",
  horario_entrada: "expected_start_time",
  saida_almoco: "expected_lunch_start_time",
  horario_saida_almoco: "expected_lunch_start_time",
  retorno_almoco: "expected_lunch_end_time",
  horario_retorno_almoco: "expected_lunch_end_time",
  saida: "expected_end_time",
  horario_saida: "expected_end_time",
  pin: "pin",
  pin_opcional: "pin",
  status: "status"
};

export const importTemplateHeaders = [
  "matricula",
  "nome_completo",
  "documento",
  "telefone",
  "cargo",
  "setor",
  "filial",
  "tipo_contratacao",
  "salario",
  "diaria",
  "forma_calculo",
  "pix",
  "banco",
  "agencia",
  "conta",
  "data_admissao",
  "escala",
  "dia_pagamento",
  "entrada",
  "saida_almoco",
  "retorno_almoco",
  "saida",
  "pin_opcional",
  "status"
];

function normalizeHeader(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function text(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "text" in (value as any)) return String((value as any).text || "").trim();
  return String(value).trim();
}

function money(value: unknown) {
  const raw = text(value).replace(/R\$|\s/g, "").replace(/\./g, "").replace(",", ".");
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function dateValue(value: unknown) {
  if (!value) return undefined;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const raw = text(value);
  if (!raw) return undefined;
  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  return undefined;
}

function parseWorkDays(value: unknown) {
  const raw = text(value);
  if (!raw) return [1, 2, 3, 4, 5, 6];
  const numbers = raw
    .split(/[;,| ]+/)
    .map((part) => Number(part.trim()))
    .filter((part) => Number.isFinite(part) && part >= 0 && part <= 6);
  return numbers.length ? [...new Set(numbers)] : [1, 2, 3, 4, 5, 6];
}

export function generatePin4() {
  return String(crypto.randomInt(0, 10000)).padStart(4, "0");
}

function normalizeEmployment(value: unknown) {
  const raw = normalizeHeader(value || "mensalista");
  if (raw.includes("diar")) return "diarista";
  if (raw.includes("quinz")) return "quinzenal";
  return "mensalista";
}

function normalizeDailyMode(value: unknown) {
  const raw = normalizeHeader(value || "automatic");
  return raw.includes("manual") ? "manual" : "automatic";
}

export async function parseEmployeeImportFile(file: File): Promise<ImportRow[]> {
  const name = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());
  if (name.endsWith(".csv")) return parseCsv(buffer.toString("utf8"));
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) return parseWorkbook(buffer);
  if (name.endsWith(".pdf")) return parsePdfAssistido(buffer);
  throw new Error("Formato não suportado. Envie Excel (.xlsx/.xls), CSV ou PDF com tabela simples.");
}

function normalizeRow(rowNumber: number, values: Record<string, unknown>): ImportRow {
  const errors: string[] = [];
  const warnings: string[] = [];
  const pin = text(values.pin);
  const fullName = text(values.full_name);
  const branchName = text(values.branch_name);
  const role = text(values.role);
  const employmentType = normalizeEmployment(values.employment_type);
  const monthlySalary = money(values.monthly_salary) ?? 0;
  const dailyRate = money(values.daily_rate);
  const admission = dateValue(values.admission_date) || new Date().toISOString().slice(0, 10);

  if (!fullName) errors.push("Nome completo obrigatório.");
  if (!branchName) errors.push("Filial obrigatória.");
  if (!role) errors.push("Cargo obrigatório.");
  if (employmentType === "diarista" && !dailyRate) warnings.push("Diarista sem diária: será calculada automaticamente quando possível.");
  if (employmentType !== "diarista" && !monthlySalary) errors.push("Salário mensal obrigatório para mensalista/quinzenal.");
  if (pin && !/^\d{4}$/.test(pin)) errors.push("PIN deve ter exatamente 4 dígitos.");

  return {
    rowNumber,
    registration_code: text(values.registration_code) || undefined,
    full_name: fullName,
    document: text(values.document) || undefined,
    phone: text(values.phone) || undefined,
    role,
    sector: text(values.sector) || undefined,
    branch_name: branchName,
    employment_type: employmentType,
    monthly_salary: monthlySalary,
    daily_rate: dailyRate ?? null,
    daily_rate_mode: normalizeDailyMode(values.daily_rate_mode),
    pix_key: text(values.pix_key) || undefined,
    bank_name: text(values.bank_name) || undefined,
    bank_agency: text(values.bank_agency) || undefined,
    bank_account: text(values.bank_account) || undefined,
    admission_date: admission,
    status: normalizeHeader(values.status || "ativo") === "inativo" ? "inactive" : "active",
    work_days: parseWorkDays(values.work_days),
    payment_day: money(values.payment_day) ?? null,
    expected_start_time: text(values.expected_start_time) || undefined,
    expected_lunch_start_time: text(values.expected_lunch_start_time) || undefined,
    expected_lunch_end_time: text(values.expected_lunch_end_time) || undefined,
    expected_end_time: text(values.expected_end_time) || undefined,
    pin: pin || undefined,
    action: "create",
    errors,
    warnings
  };
}

function mapRow(rowNumber: number, headers: string[], values: unknown[]) {
  const obj: Record<string, unknown> = {};
  headers.forEach((header, index) => {
    const key = headerAliases[normalizeHeader(header)];
    if (key && key !== "ignore") obj[key] = values[index];
  });
  return normalizeRow(rowNumber, obj);
}

async function parseWorkbook(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("A planilha não possui abas.");
  const headerRow = sheet.getRow(1);
  const headers = headerRow.values as unknown[];
  const headerList = headers.slice(1).map(text);
  const rows: ImportRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = (row.values as unknown[]).slice(1);
    if (!values.some((value) => text(value))) return;
    rows.push(mapRow(rowNumber, headerList, values));
  });
  return rows;
}

function parseCsv(content: string) {
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) throw new Error("CSV vazio.");
  const separator = lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(separator).map((item) => item.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line, index) => {
    const values = line.split(separator).map((item) => item.trim().replace(/^"|"$/g, ""));
    return mapRow(index + 2, headers, values);
  });
}

function parsePdfAssistido(buffer: Buffer) {
  const decoded = buffer.toString("latin1");
  const textSnippets = [...decoded.matchAll(/\(([^()]{2,120})\)/g)].map((match) => match[1].replace(/\\\)/g, ")").replace(/\\\(/g, "(")).join("\n");
  const lines = textSnippets.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const tableLines = lines.filter((line) => line.includes(";") || line.includes("\t"));
  if (!tableLines.length) {
    return [
      {
        rowNumber: 1,
        full_name: "",
        role: "",
        branch_name: "",
        employment_type: "mensalista",
        errors: ["Não foi possível identificar tabela no PDF. Use o modelo Excel ou um PDF gerado a partir de tabela com separador ponto e vírgula."],
        warnings: ["Importação de PDF é assistida e sempre exige conferência manual antes de salvar."],
        action: "skip" as const
      }
    ];
  }
  return parseCsv(tableLines.join("\n"));
}

export async function createEmployeeImportTemplateBuffer() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "NexPonto";
  const instructions = workbook.addWorksheet("Instruções");
  instructions.columns = [{ width: 34 }, { width: 86 }];
  instructions.addRow(["NexPonto", "Modelo oficial para importação de funcionários"]);
  instructions.addRow(["PIN", "Opcional. Se vazio, o sistema gera PIN automático de 4 dígitos."]);
  instructions.addRow(["Escala", "Use 1,2,3,4,5,6 para segunda a sábado. 0 representa domingo."]);
  instructions.addRow(["Filial", "Use o mesmo nome cadastrado em Gestão de filiais."]);
  instructions.addRow(["Tipo", "mensalista, quinzenal ou diarista."]);
  instructions.getRow(1).font = { bold: true, size: 14, color: { argb: "FF064320" } };

  const sheet = workbook.addWorksheet("Funcionários");
  sheet.addRow(importTemplateHeaders);
  sheet.addRow(["MATRICULA_EXEMPLO", "NOME COMPLETO", "", "", "CARGO", "SETOR", "FILIAL CADASTRADA", "mensalista", 0, "", "automatic", "", "", "", "", "2026-01-01", "1,2,3,4,5", 5, "08:00", "12:00", "13:00", "17:00", "", "ativo"]);
  sheet.getRow(1).height = 28;
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF078D3A" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: { row: 1, column: importTemplateHeaders.length } };
  sheet.columns.forEach((column, index) => (column.width = Math.max(16, importTemplateHeaders[index]?.length + 4 || 16)));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export function buildImportReportTable(rows: ImportRow[], title = "Relatório de Importação de Funcionários"): ExportTable {
  const created = rows.filter((row) => row.action === "create" && !row.errors.length).length;
  const updated = rows.filter((row) => row.action === "update" && !row.errors.length).length;
  const errors = rows.filter((row) => row.errors.length).length;
  const pins = rows.filter((row) => row.generated_pin).length;
  return {
    title,
    subtitle: "Cadastro em massa com PIN de 4 dígitos e conferência administrativa.",
    meta: ["Os PINs gerados devem ser entregues individualmente aos funcionários.", "Após esta exportação, os PINs não serão exibidos novamente."],
    summary: [
      { label: "Linhas", value: rows.length },
      { label: "Criados", value: created },
      { label: "Atualizados", value: updated },
      { label: "Erros", value: errors },
      { label: "PINs gerados", value: pins }
    ],
    headers: ["Linha", "Matrícula", "Funcionário", "Filial", "Cargo", "Ação", "PIN inicial", "Status", "Avisos/erros"],
    rows: rows.map((row) => [
      row.rowNumber,
      row.registration_code || "-",
      row.full_name || "-",
      row.branch_name || "-",
      row.role || "-",
      row.action || "-",
      row.generated_pin || row.pin || "Não exibido",
      row.errors.length ? "Erro" : "OK",
      [...row.errors, ...row.warnings].join(" | ") || "-"
    ]),
    footer: "NexPonto — Importação de funcionários"
  };
}

export function buildEmployeesExportTable(rows: any[], canViewFinancial: boolean): ExportTable {
  const incomplete = rows.filter((item) => !item.branch_id || item.has_pin === false || !item.role || !item.payment_day || !item.expected_start_time || !item.expected_end_time || !item.expected_lunch_start_time || !item.expected_lunch_end_time || (!Number(item.monthly_salary || 0) && !Number(item.daily_rate || 0))).length;
  const headers = ["Matrícula", "Funcionário", "Documento", "Telefone", "Filial", "Setor", "Cargo", "Contrato", "Dia pag.", "Entrada", "Almoço", "Retorno", "Saída", "Status", "Pendências"];
  if (canViewFinancial) headers.push("Salário", "Diária", "Pix", "Banco", "Agência", "Conta");
  return {
    title: "Cadastro de Funcionários",
    subtitle: "Exportação profissional para RH e conferência cadastral.",
    summary: [
      { label: "Funcionários", value: rows.length },
      { label: "Ativos", value: rows.filter((item) => item.active).length },
      { label: "Inativos", value: rows.filter((item) => !item.active).length },
      { label: "Pendências", value: incomplete }
    ],
    headers,
    rows: rows.map((item) => {
      const pendencies = [
        !item.branch_id && "Sem filial",
        item.has_pin === false && "Sem PIN",
        !item.role && "Sem cargo",
        !item.payment_day && "Sem dia pagamento",
        !item.expected_start_time && "Sem entrada",
        !item.expected_lunch_start_time && "Sem saída almoço",
        !item.expected_lunch_end_time && "Sem retorno almoço",
        !item.expected_end_time && "Sem saída",
        !Number(item.monthly_salary || item.daily_rate || 0) && "Sem salário/diária",
        !item.work_days?.length && "Sem escala",
        !item.pix_key && !item.bank_account && "Sem dados pagamento"
      ].filter(Boolean).join(" | ") || "Completo";
      const base = [
        item.registration_code || "-",
        item.full_name || "-",
        item.document || "-",
        item.phone || "-",
        item.branches?.name || item.branch_name || "-",
        item.sector || "-",
        item.role || "-",
        item.employment_type || "-",
        item.payment_day ? `Dia ${item.payment_day}` : "-",
        item.expected_start_time || "-",
        item.expected_lunch_start_time || "-",
        item.expected_lunch_end_time || "-",
        item.expected_end_time || "-",
        item.active ? "Ativo" : "Inativo",
        pendencies
      ];
      if (canViewFinancial) base.push(formatMoney(item.monthly_salary), formatMoney(item.daily_rate), item.pix_key || "-", item.bank_name || "-", item.bank_agency || "-", item.bank_account || "-");
      return base;
    }),
    footer: "NexPonto — Cadastro de funcionários"
  };
}
