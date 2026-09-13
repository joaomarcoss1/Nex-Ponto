"use client";

import { Check, MapPin, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { adminFetch } from "@/lib/client/admin-api";
import { actionLabels } from "@/lib/constants";
import { formatDateTime, minutesToHourText } from "@/lib/format";
import type { TimeAction } from "@/types/domain";

export function PointReviewsPage() {
  const [reviews, setReviews] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [filters, setFilters] = useState({ status: "pending_review", branchId: "", employeeId: "", startDate: "", endDate: "" });
  const [notes, setNotes] = useState<Record<string, string>>({});
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
      const data = await adminFetch<any>(`/api/admin/point-reviews?${params.toString()}`);
      setReviews(data.reviews || []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar revisões.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function review(id: string, status: "approved" | "rejected" | "cancelled") {
    try {
      await adminFetch("/api/admin/point-reviews", {
        method: "PATCH",
        body: JSON.stringify({ id, status, observation: notes[id] || "" })
      });
      setMessage(status === "approved" ? "Ocorrência aprovada." : "Ocorrência rejeitada/cancelada.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao revisar ocorrência.");
    }
  }

  return (
    <AdminShell>
      <SectionTitle title="Revisões de ponto" description="Analise atrasos, saídas antecipadas e justificativas vinculadas ao ponto." />
      <Card className="mb-4">
        <div className="grid gap-3 md:grid-cols-5">
          <Field label="Status">
            <Select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
              <option value="">Todos</option>
              <option value="pending_review">Pendentes</option>
              <option value="approved">Aprovadas</option>
              <option value="rejected">Rejeitadas</option>
              <option value="adjusted">Ajustadas</option>
              <option value="cancelled">Canceladas</option>
            </Select>
          </Field>
          <Field label="Filial">
            <Select value={filters.branchId} onChange={(event) => setFilters({ ...filters, branchId: event.target.value })}>
              <option value="">Todas</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Funcionário">
            <Select value={filters.employeeId} onChange={(event) => setFilters({ ...filters, employeeId: event.target.value })}>
              <option value="">Todos</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>{employee.full_name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Início">
            <Input type="date" value={filters.startDate} onChange={(event) => setFilters({ ...filters, startDate: event.target.value })} />
          </Field>
          <Field label="Fim">
            <Input type="date" value={filters.endDate} onChange={(event) => setFilters({ ...filters, endDate: event.target.value })} />
          </Field>
        </div>
        <Button className="mt-4" onClick={load}><Search className="h-4 w-4" />Filtrar</Button>
      </Card>
      {message ? <p className="mb-3 rounded-lg bg-emerald-50 p-3 font-bold text-emerald-800">{message}</p> : null}
      {error ? <p className="mb-3 rounded-lg bg-red-50 p-3 font-bold text-red-800">{error}</p> : null}
      <div className="grid gap-3">
        {reviews.map((item) => (
          <Card key={item.id}>
            <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-black">{item.employees?.full_name}</h2>
                  <Badge tone={item.occurrence_review_status === "approved" ? "green" : item.occurrence_review_status === "rejected" ? "red" : "yellow"}>
                    {item.occurrence_review_status}
                  </Badge>
                </div>
                <p className="mt-1 text-sm font-semibold text-slate-600">
                  {item.branches?.name} • {formatDateTime(item.entry_timestamp)} • {actionLabels[item.action as TimeAction]}
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs font-bold text-slate-500">Previsto</p><p>{item.expected_start_time || item.expected_end_time || "-"}</p></div>
                  <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs font-bold text-slate-500">Atraso</p><p>{minutesToHourText(item.late_minutes)}</p></div>
                  <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs font-bold text-slate-500">Saída ant.</p><p>{minutesToHourText(item.early_leave_minutes)}</p></div>
                  <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs font-bold text-slate-500">Distância</p><p>{item.distance_meters || 0}m</p></div>
                </div>
                <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-900">{item.justification_text || "Sem justificativa textual."}</p>
                <p className="mt-2 inline-flex items-center gap-2 text-sm text-slate-600"><MapPin className="h-4 w-4" /> Lat {item.latitude || "-"} / Lng {item.longitude || "-"}</p>
              </div>
              <div className="grid gap-3">
                <Field label="Observação RH/admin">
                  <Textarea value={notes[item.id] || item.occurrence_review_observation || ""} onChange={(event) => setNotes({ ...notes, [item.id]: event.target.value })} />
                </Field>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Button variant="secondary" onClick={() => review(item.id, "approved")}><Check className="h-4 w-4" />Aprovar</Button>
                  <Button variant="danger" onClick={() => review(item.id, "rejected")}><X className="h-4 w-4" />Rejeitar</Button>
                </div>
              </div>
            </div>
          </Card>
        ))}
        {!reviews.length ? <Card className="text-center text-slate-500">Nenhuma ocorrência encontrada para os filtros atuais.</Card> : null}
      </div>
    </AdminShell>
  );
}
