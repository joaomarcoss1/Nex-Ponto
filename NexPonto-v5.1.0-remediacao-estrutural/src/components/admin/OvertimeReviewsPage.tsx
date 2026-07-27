"use client";

import { Check, RefreshCw, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { adminFetch } from "@/lib/client/admin-api";
import { formatMoney, minutesToHourText } from "@/lib/format";

export function OvertimeReviewsPage() {
  const [reviews, setReviews] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [filters, setFilters] = useState({ status: "pending", branchId: "", employeeId: "", startDate: "", endDate: "" });
  const [edits, setEdits] = useState<Record<string, any>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    adminFetch<any>("/api/admin/employees?status=active").then((data) => setEmployees(data.employees || [])).catch(() => undefined);
    adminFetch<any>("/api/admin/branches?status=active").then((data) => setBranches(data.branches || [])).catch(() => undefined);
  }, []);

  async function load() {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => value && params.set(key, value));
    try {
      const data = await adminFetch<any>(`/api/admin/overtime-reviews?${params.toString()}`);
      setReviews(data.reviews || []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar horas extras.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function detect() {
    try {
      const data = await adminFetch<any>("/api/admin/overtime-reviews", {
        method: "POST",
        body: JSON.stringify({ startDate: filters.startDate, endDate: filters.endDate, branchId: filters.branchId, employeeId: filters.employeeId })
      });
      setMessage(`${data.detected} ocorrência(s) detectada(s), ${data.created} nova(s).`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao detectar horas extras.");
    }
  }

  async function review(item: any, status: "approved" | "rejected" | "adjusted") {
    const edit = edits[item.id] || {};
    try {
      await adminFetch("/api/admin/overtime-reviews", {
        method: "PATCH",
        body: JSON.stringify({
          id: item.id,
          status,
          approved_overtime_minutes: edit.approved_overtime_minutes ?? item.calculated_overtime_minutes,
          overtime_amount: edit.overtime_amount ?? item.overtime_amount,
          reviewed_observation: edit.reviewed_observation || item.reviewed_observation || ""
        })
      });
      setMessage("Hora extra revisada com auditoria.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao revisar hora extra.");
    }
  }

  return (
    <AdminShell>
      <SectionTitle title="Horas extras" description="Detecte, aprove, rejeite ou ajuste horas extras antes de gerar a folha." />
      <Card className="mb-4">
        <div className="grid gap-3 md:grid-cols-5">
          <Field label="Status">
            <Select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
              <option value="">Todos</option>
              <option value="pending">Pendentes</option>
              <option value="approved">Aprovadas</option>
              <option value="rejected">Rejeitadas</option>
              <option value="adjusted">Ajustadas</option>
            </Select>
          </Field>
          <Field label="Filial">
            <Select value={filters.branchId} onChange={(event) => setFilters({ ...filters, branchId: event.target.value })}>
              <option value="">Todas</option>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </Select>
          </Field>
          <Field label="Funcionário">
            <Select value={filters.employeeId} onChange={(event) => setFilters({ ...filters, employeeId: event.target.value })}>
              <option value="">Todos</option>
              {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}
            </Select>
          </Field>
          <Field label="Início"><Input type="date" value={filters.startDate} onChange={(event) => setFilters({ ...filters, startDate: event.target.value })} /></Field>
          <Field label="Fim"><Input type="date" value={filters.endDate} onChange={(event) => setFilters({ ...filters, endDate: event.target.value })} /></Field>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={load}><Search className="h-4 w-4" />Filtrar</Button>
          <Button variant="secondary" onClick={detect}><RefreshCw className="h-4 w-4" />Detectar extras</Button>
        </div>
      </Card>
      {message ? <p className="mb-3 rounded-lg bg-emerald-50 p-3 font-bold text-emerald-800">{message}</p> : null}
      {error ? <p className="mb-3 rounded-lg bg-red-50 p-3 font-bold text-red-800">{error}</p> : null}
      <div className="grid gap-3">
        {reviews.map((item) => {
          const edit = edits[item.id] || {};
          return (
            <Card key={item.id}>
              <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-black">{item.employees?.full_name}</h2>
                    <Badge tone={item.status === "approved" ? "green" : item.status === "rejected" ? "red" : "yellow"}>{item.status}</Badge>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-slate-600">{item.branches?.name} • {item.entry_date}</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs font-bold text-slate-500">Previsto</p><p>{minutesToHourText(item.expected_minutes)}</p></div>
                    <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs font-bold text-slate-500">Realizado</p><p>{minutesToHourText(item.worked_minutes)}</p></div>
                    <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs font-bold text-slate-500">Extra calc.</p><p>{minutesToHourText(item.calculated_overtime_minutes || item.overtime_minutes)}</p></div>
                    <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs font-bold text-slate-500">Valor</p><p>{formatMoney(item.overtime_amount)}</p></div>
                  </div>
                </div>
                <div className="grid gap-3">
                  <Field label="Minutos aprovados"><Input type="number" value={edit.approved_overtime_minutes ?? item.approved_overtime_minutes ?? item.calculated_overtime_minutes} onChange={(event) => setEdits({ ...edits, [item.id]: { ...edit, approved_overtime_minutes: event.target.value } })} /></Field>
                  <Field label="Valor estimado"><Input type="number" value={edit.overtime_amount ?? item.overtime_amount} onChange={(event) => setEdits({ ...edits, [item.id]: { ...edit, overtime_amount: event.target.value } })} /></Field>
                  <Field label="Observação"><Textarea value={edit.reviewed_observation ?? item.reviewed_observation ?? ""} onChange={(event) => setEdits({ ...edits, [item.id]: { ...edit, reviewed_observation: event.target.value } })} /></Field>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Button variant="secondary" onClick={() => review(item, "approved")}><Check className="h-4 w-4" />Aprovar</Button>
                    <Button variant="danger" onClick={() => review(item, "rejected")}><X className="h-4 w-4" />Rejeitar</Button>
                  </div>
                  <Button variant="ghost" onClick={() => review(item, "adjusted")}>Salvar ajuste</Button>
                </div>
              </div>
            </Card>
          );
        })}
        {!reviews.length ? <Card className="text-center text-slate-500">Nenhuma hora extra encontrada para os filtros atuais.</Card> : null}
      </div>
    </AdminShell>
  );
}
