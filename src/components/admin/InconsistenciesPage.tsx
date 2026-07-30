"use client";

import { CheckCircle2, RefreshCw, RotateCcw, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { adminFetch } from "@/lib/client/admin-api";

const labels: Record<string, string> = {
  ponto_fora_de_ordem: "Ponto fora de ordem",
  falta_encerramento: "Falta de encerramento",
  falta_volta_almoco: "Falta de volta do almoço",
  ponto_fora_do_raio: "Ponto fora do raio",
  atraso_com_justificativa: "Atraso com justificativa",
  saida_antecipada_com_justificativa: "Saída antecipada com justificativa",
  falta_sem_justificativa: "Falta sem justificativa",
  falta_com_justificativa_pendente: "Falta com justificativa pendente",
  hora_extra_pendente: "Hora extra pendente",
  funcionario_sem_escala: "Funcionário sem escala",
  funcionario_sem_salario: "Funcionário sem salário",
  funcionario_sem_filial: "Funcionário sem filial",
  funcionario_sem_pin: "Funcionário sem PIN"
};

type ResolutionModal = {
  item: any;
  status: "approved" | "pending_review" | "cancelled";
  title: string;
} | null;

export function InconsistenciesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [modal, setModal] = useState<ResolutionModal>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminFetch<any>("/api/admin/employees?status=active").then((data) => setEmployees(data.employees || [])).catch(() => undefined);
    adminFetch<any>("/api/admin/branches?status=active").then((data) => setBranches(data.branches || [])).catch(() => undefined);
  }, []);

  async function load() {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => value && params.set(key, value));
    try {
      const data = await adminFetch<any>(`/api/admin/inconsistencies?${params.toString()}`);
      setItems(data.inconsistencies || []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar inconsistências.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openResolution(item: any, status: "approved" | "pending_review" | "cancelled") {
    if (!item.entry_id) {
      setError("Esta inconsistência é de cadastro/folha e não possui ponto vinculado para ação direta. Abra o cadastro relacionado para corrigir.");
      return;
    }
    const title = status === "approved" ? "Marcar como resolvida" : status === "pending_review" ? "Enviar para revisão" : "Cancelar ocorrência";
    setReason("");
    setModal({ item, status, title });
  }

  async function confirmResolution() {
    if (!modal) return;
    if (reason.trim().length < 5) {
      setError("Informe um motivo com pelo menos 5 caracteres.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await adminFetch("/api/admin/inconsistencies", {
        method: "PATCH",
        body: JSON.stringify({ entryId: modal.item.entry_id, status: modal.status, reason })
      });
      setMessage("Inconsistência atualizada com auditoria.");
      setModal(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao resolver inconsistência.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminShell>
      <SectionTitle title="Revisão de inconsistências" description="Fila operacional para revisar pontos, faltas, horas extras e cadastros incompletos." />
      <Card className="mb-4 animate-fade-in">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Filial">
            <Select value={filters.branchId || ""} onChange={(event) => setFilters({ ...filters, branchId: event.target.value })}>
              <option value="">Todas</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Funcionário">
            <Select value={filters.employeeId || ""} onChange={(event) => setFilters({ ...filters, employeeId: event.target.value })}>
              <option value="">Todos</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>{employee.full_name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Início">
            <Input type="date" value={filters.startDate || ""} onChange={(event) => setFilters({ ...filters, startDate: event.target.value })} />
          </Field>
          <Field label="Fim">
            <Input type="date" value={filters.endDate || ""} onChange={(event) => setFilters({ ...filters, endDate: event.target.value })} />
          </Field>
        </div>
        <Button className="mt-4" onClick={load}>
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </Button>
      </Card>
      {message ? <p className="mb-3 rounded-lg bg-emerald-50 p-3 font-bold text-emerald-800">{message}</p> : null}
      {error ? <p className="mb-3 rounded-lg bg-red-50 p-3 font-bold text-red-800">{error}</p> : null}
      <div className="grid gap-3">
        {items.map((item, index) => (
          <Card key={`${item.type}-${item.entry_id || item.employee_id || index}`} className="animate-fade-in">
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
              <div>
                <Badge tone="yellow">{labels[item.type] || item.type}</Badge>
                <h2 className="mt-2 font-black text-slate-950">{item.employee_name}</h2>
                <p className="text-sm text-slate-600">{item.branch_name || "-"} • {item.date || "-"}</p>
              </div>
              <div className="grid gap-3">
                <p className="max-w-2xl text-sm font-semibold text-slate-700">{item.message}</p>
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  <Button size="sm" variant="secondary" onClick={() => openResolution(item, "approved")}>
                    <CheckCircle2 className="h-4 w-4" /> Resolver
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openResolution(item, "pending_review")}>
                    <RotateCcw className="h-4 w-4" /> Revisão
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => openResolution(item, "cancelled")}>
                    <XCircle className="h-4 w-4" /> Cancelar
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        ))}
        {!items.length ? <Card className="text-center text-slate-500">Nenhuma inconsistência encontrada para os filtros atuais.</Card> : null}
      </div>

      {modal ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[28px] bg-white p-5 shadow-[0_32px_100px_rgba(0,0,0,0.25)]">
            <div className="mb-4">
              <Badge tone="yellow">{labels[modal.item.type] || modal.item.type}</Badge>
              <h2 className="mt-2 text-2xl font-black text-slate-950">{modal.title}</h2>
              <p className="mt-1 text-sm font-semibold text-slate-600">{modal.item.employee_name} • {modal.item.date}</p>
              <p className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm font-semibold text-slate-700">{modal.item.message}</p>
            </div>
            <Field label="Motivo obrigatório">
              <Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explique a decisão do RH/admin" />
            </Field>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => setModal(null)} disabled={saving}>Cancelar</Button>
              <Button onClick={confirmResolution} disabled={saving || reason.trim().length < 5}>Confirmar</Button>
            </div>
          </div>
        </div>
      ) : null}
    </AdminShell>
  );
}
