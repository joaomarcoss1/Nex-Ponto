"use client";

import { Download, FileSpreadsheet, FilterX, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { adminFetch, downloadAdminFile } from "@/lib/client/admin-api";

const initialFilters = {
  type: "points",
  branchId: "",
  employeeId: "",
  startDate: "",
  endDate: "",
  status: "",
  action: "",
  payrollId: "",
  role: "",
  employmentType: "",
  discountStatus: "",
  paymentDay: ""
};

const reportLabels: Record<string, string> = {
  points: "Relatório de Pontos",
  absences: "Relatório de Faltas",
  late: "Relatório de Atrasos",
  early_leave: "Relatório de Saídas Antecipadas",
  lunch: "Relatório de Almoço",
  overtime: "Relatório de Horas Extras",
  payroll: "Financeiro/Folha",
  employee: "Relatório Individual",
  branch: "Relatório por Filial",
  inconsistencies: "Inconsistências",
  justifications: "Justificativas",
  executive: "Relatório Executivo Mensal",
  geolocation: "Relatório de Geolocalização"
};

export function ReportsPage() {
  const [branches, setBranches] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [preview, setPreview] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [filters, setFilters] = useState(initialFilters);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [downloading, setDownloading] = useState<"pdf" | "xlsx" | "">("");

  useEffect(() => {
    adminFetch<any>("/api/admin/branches?status=active").then((data) => setBranches(data.branches || [])).catch(() => undefined);
    adminFetch<any>("/api/admin/employees?status=active").then((data) => setEmployees(data.employees || [])).catch(() => undefined);
  }, []);

  const filteredEmployees = employees.filter((employee) => !filters.branchId || employee.branch_id === filters.branchId);

  function query(format?: string) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => value && params.set(key, value));
    if (format) params.set("format", format);
    const base = filters.type === "geolocation" ? "/api/admin/geo-report" : "/api/admin/reports";
    return `${base}?${params.toString()}`;
  }

  async function loadPreview() {
    try {
      setMessage("");
      const data = await adminFetch<any>(query());
      setPreview(data.table?.rows || []);
      setHeaders(data.table?.headers || []);
      setError("");
      setMessage("Prévia atualizada com os filtros selecionados.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao gerar prévia.");
    }
  }

  async function download(format: "pdf" | "xlsx") {
    try {
      setDownloading(format);
      setError("");
      setMessage("");
      const extension = format === "pdf" ? "pdf" : "xlsx";
      await downloadAdminFile(query(format), `${filters.type}-${new Date().toISOString().slice(0, 10)}.${extension}`);
      setMessage(format === "pdf" ? "PDF corporativo gerado com sucesso." : "Excel profissional gerado com sucesso.");
    } catch (err) {
      setError(err instanceof Error ? err.message : `Erro ao gerar ${format.toUpperCase()}.`);
    } finally {
      setDownloading("");
    }
  }

  const appliedFilters = [
    filters.startDate || filters.endDate ? `Período: ${filters.startDate || "início"} até ${filters.endDate || "fim"}` : "Período: todos",
    filters.branchId ? `Filial selecionada` : "Todas as filiais",
    filters.employeeId ? `Funcionário selecionado` : "Todos os funcionários",
    filters.paymentDay ? `Dia de pagamento: ${filters.paymentDay}` : "Todos os dias de pagamento"
  ];

  return (
    <AdminShell>
      <SectionTitle title="Relatórios" description="Pontos, faltas, atrasos, horas extras e pré-folha para conferência e exportação contábil." />
      {message ? <p className="mb-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{message}</p> : null}
      {error ? <p className="mb-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">{error}</p> : null}

      <Card className="mb-4 overflow-hidden p-0">
        <div className="border-b border-brand-100 bg-gradient-to-r from-brand-800 via-brand-700 to-brand-600 p-5 text-white">
          <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-sun-100">Central de relatórios</p>
              <h2 className="mt-1 text-2xl font-black">{reportLabels[filters.type]}</h2>
              <p className="mt-1 text-sm font-medium text-emerald-50">PDFs com logo, paleta azul navy/dourado e layout de RH corporativo.</p>
            </div>
            <div className="admin-action-row">
              <Button variant="secondary" onClick={() => download("pdf")} disabled={downloading === "pdf"}>
                <Download className="h-4 w-4" />
                {downloading === "pdf" ? "Gerando..." : "Exportar PDF"}
              </Button>
              <Button variant="ghost" onClick={() => download("xlsx")} disabled={downloading === "xlsx"} className="border-white/20 bg-white/10 text-white hover:bg-white hover:text-brand-800">
                <FileSpreadsheet className="h-4 w-4" />
                {downloading === "xlsx" ? "Gerando..." : "Exportar Excel"}
              </Button>
            </div>
          </div>
        </div>
        <div className="grid gap-3 p-5 md:grid-cols-4 xl:grid-cols-6">
          <Field label="Relatório">
            <Select value={filters.type} onChange={(event) => setFilters({ ...filters, type: event.target.value, status: "" })}>
              <option value="points">Pontos</option>
              <option value="absences">Faltas</option>
              <option value="late">Atrasos</option>
              <option value="early_leave">Saídas antecipadas</option>
              <option value="lunch">Almoço</option>
              <option value="overtime">Horas extras</option>
              <option value="payroll">Financeiro/Folha</option>
              <option value="employee">Individual</option>
              <option value="branch">Por filial</option>
              <option value="inconsistencies">Inconsistências</option>
              <option value="justifications">Justificativas</option>
              <option value="executive">Executivo mensal</option>
              <option value="geolocation">Geolocalização</option>
            </Select>
          </Field>
          <Field label="Filial">
            <Select value={filters.branchId} onChange={(event) => setFilters({ ...filters, branchId: event.target.value, employeeId: "" })}>
              <option value="">Todas</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Funcionário">
            <Select value={filters.employeeId} onChange={(event) => setFilters({ ...filters, employeeId: event.target.value })}>
              <option value="">Todos</option>
              {filteredEmployees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.full_name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Início">
            <Input type="date" value={filters.startDate} onChange={(event) => setFilters({ ...filters, startDate: event.target.value })} />
          </Field>
          <Field label="Fim">
            <Input type="date" value={filters.endDate} onChange={(event) => setFilters({ ...filters, endDate: event.target.value })} />
          </Field>
          <Field label="Status">
            <Select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
              <option value="">Todos</option>
              {filters.type === "points" || filters.type === "late" || filters.type === "early_leave" || filters.type === "inconsistencies" ? (
                <>
                  <option value="valid">Ponto válido</option>
                  <option value="pending_review">Pendente de revisão</option>
                  <option value="adjusted">Ajustado</option>
                  <option value="blocked">Bloqueado</option>
                  <option value="canceled">Cancelado</option>
                </>
              ) : null}
              {filters.type === "justifications" || filters.type === "absences" || filters.type === "overtime" ? (
                <>
                  <option value="pending">Pendente</option>
                  <option value="approved">Aprovado</option>
                  <option value="rejected">Rejeitado</option>
                  <option value="adjusted">Ajustado</option>
                </>
              ) : null}
            </Select>
          </Field>
          <Field label="Ação do ponto">
            <Select value={filters.action} onChange={(event) => setFilters({ ...filters, action: event.target.value })}>
              <option value="">Todas</option>
              <option value="start_shift">Iniciar expediente</option>
              <option value="start_lunch">Sair para almoço</option>
              <option value="end_lunch">Voltar do almoço</option>
              <option value="end_shift">Encerrar expediente</option>
            </Select>
          </Field>
          <Field label="Cargo">
            <Input value={filters.role} onChange={(event) => setFilters({ ...filters, role: event.target.value })} placeholder="Ex.: caixa" />
          </Field>
          <Field label="Tipo de contratação">
            <Select value={filters.employmentType} onChange={(event) => setFilters({ ...filters, employmentType: event.target.value })}>
              <option value="">Todos</option>
              <option value="mensalista">Mensalista</option>
              <option value="quinzenal">Quinzenal</option>
              <option value="diarista">Diarista</option>
            </Select>
          </Field>
          <Field label="Dia de pagamento">
            <Select value={filters.paymentDay} onChange={(event) => setFilters({ ...filters, paymentDay: event.target.value })}>
              <option value="">Todos</option>
              {[5, 10, 15, 20, 25, 30].map((day) => <option key={day} value={day}>Dia {day}</option>)}
            </Select>
          </Field>
          <Field label="Desconto falta">
            <Select value={filters.discountStatus} onChange={(event) => setFilters({ ...filters, discountStatus: event.target.value })}>
              <option value="">Todos</option>
              <option value="with_discount">Com desconto</option>
              <option value="without_discount">Sem desconto</option>
            </Select>
          </Field>
        </div>
        <div className="flex flex-col justify-between gap-3 border-t border-slate-100 p-5 lg:flex-row lg:items-center">
          <div className="flex flex-wrap gap-2 text-xs font-bold text-slate-600">
            {appliedFilters.map((filter) => (
              <span key={filter} className="rounded-full bg-slate-100 px-3 py-1">{filter}</span>
            ))}
          </div>
          <div className="admin-action-row">
            <Button onClick={loadPreview}>
              <Search className="h-4 w-4" />
              Aplicar filtros
            </Button>
            <Button variant="ghost" onClick={() => { setFilters(initialFilters); setPreview([]); setHeaders([]); setMessage("Filtros limpos."); }}>
              <FilterX className="h-4 w-4" />
              Limpar filtros
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-black text-slate-950">Prévia</h2>
            <p className="text-sm font-medium text-slate-500">Até 30 primeiras linhas para conferência antes da exportação.</p>
          </div>
          <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-black text-brand-800">{preview.length} linha(s)</span>
        </div>
        <div className="admin-table-shell">
          <table className="w-full min-w-[900px] text-left text-sm">
            {headers.length ? (
              <thead className="bg-brand-700 text-xs uppercase text-white">
                <tr>
                  {headers.map((header) => <th key={header} className="p-3 font-black">{header}</th>)}
                </tr>
              </thead>
            ) : null}
            <tbody>
              {preview.slice(0, 30).map((row, index) => (
                <tr key={index} className="border-b border-slate-100 odd:bg-white even:bg-brand-50/40">
                  {row.map((cell: string, cellIndex: number) => (
                    <td key={cellIndex} className="p-3 align-top">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
              {!preview.length ? (
                <tr>
                  <td className="p-10 text-center text-slate-500" colSpan={Math.max(headers.length, 1)}>
                    Use os filtros para visualizar uma prévia ou exporte diretamente em PDF/Excel.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </AdminShell>
  );
}
