"use client";

import { Clock3, MapPin, Plus, Save, UserRound, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { adminFetch } from "@/lib/client/admin-api";
import { actionLabels, statusLabels } from "@/lib/constants";
import { formatDateTimeInput, localDateTimeToIso, minutesToHourText } from "@/lib/format";
import type { TimeAction, TimeEntryStatus } from "@/types/domain";

type EmployeeOption = {
  id: string;
  full_name: string;
  branch_id: string;
  registration_code?: string | null;
};

type BranchOption = {
  id: string;
  name: string;
  timezone?: string | null;
};

type TimeEntryRow = {
  id: string;
  employee_id: string;
  branch_id: string;
  action: TimeAction;
  entry_timestamp: string;
  entry_date: string;
  status: TimeEntryStatus;
  distance_meters: number | null;
  inside_allowed_radius: boolean | null;
  late_minutes: number;
  early_leave_minutes: number;
  justification_text?: string | null;
  employees?: { full_name?: string | null; role?: string | null } | null;
  branches?: { name?: string | null; timezone?: string | null } | null;
};

type AdjustmentForm = {
  entry_timestamp: string;
  timezone: string;
  action: TimeAction;
  status: TimeEntryStatus;
  late_minutes: number | string;
  early_leave_minutes: number | string;
  justification_text: string;
  adjustment_reason: string;
};

type ManualForm = {
  employee_id: string;
  branch_id: string;
  action: TimeAction;
  entry_timestamp: string;
  adjustment_reason: string;
  late_minutes: number | string;
  early_leave_minutes: number | string;
  justification_text: string;
  idempotency_key: string;
};

function newIdempotencyKey() {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  return `manual-ui:${id}`;
}

function formatEntryDate(value: string, timeZone?: string | null) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: timeZone || "America/Fortaleza"
  }).format(date);
}

function gpsLabel(value: boolean | null, distance: number | null) {
  if (value === null) return { label: "Sem GPS", tone: "neutral" as const };
  if (value) return { label: distance === null ? "GPS válido" : `${distance} m`, tone: "green" as const };
  return { label: distance === null ? "Fora do raio" : `${distance} m · fora`, tone: "red" as const };
}

export function TimeEntriesPage() {
  const [entries, setEntries] = useState<TimeEntryRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<TimeEntryRow | null>(null);
  const [adjustment, setAdjustment] = useState<AdjustmentForm | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState<ManualForm | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const branchById = useMemo(() => new Map(branches.map((branch) => [branch.id, branch])), [branches]);

  useEffect(() => {
    Promise.all([
      adminFetch<{ employees: EmployeeOption[] }>("/api/admin/employees?status=active"),
      adminFetch<{ branches: BranchOption[] }>("/api/admin/branches?status=active")
    ])
      .then(([employeeData, branchData]) => {
        setEmployees(employeeData.employees || []);
        setBranches(branchData.branches || []);
      })
      .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : "Erro ao carregar cadastros."));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => value && params.set(key, value));
    try {
      const data = await adminFetch<{ entries: TimeEntryRow[] }>(`/api/admin/time-entries?${params.toString()}`);
      setEntries(data.entries || []);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "Erro ao carregar marcações.");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  function choose(entry: TimeEntryRow) {
    const timeZone = entry.branches?.timezone || "America/Fortaleza";
    setManualOpen(false);
    setSelected(entry);
    setAdjustment({
      entry_timestamp: formatDateTimeInput(entry.entry_timestamp, timeZone),
      timezone: timeZone,
      action: entry.action,
      status: "adjusted",
      late_minutes: entry.late_minutes ?? 0,
      early_leave_minutes: entry.early_leave_minutes ?? 0,
      justification_text: entry.justification_text || "",
      adjustment_reason: ""
    });
  }

  function openManualForm() {
    const employee = employees.find((item) => item.id === filters.employeeId) || employees[0];
    const branchId = filters.branchId || employee?.branch_id || branches[0]?.id || "";
    const timeZone = branchById.get(branchId)?.timezone || "America/Fortaleza";
    setSelected(null);
    setAdjustment(null);
    setManualOpen(true);
    setManual({
      employee_id: employee?.id || "",
      branch_id: branchId,
      action: "start_shift",
      entry_timestamp: formatDateTimeInput(new Date(), timeZone),
      adjustment_reason: "",
      late_minutes: 0,
      early_leave_minutes: 0,
      justification_text: "",
      idempotency_key: newIdempotencyKey()
    });
  }

  function updateManualEmployee(employeeId: string) {
    if (!manual) return;
    const employee = employees.find((item) => item.id === employeeId);
    const nextBranchId = employee?.branch_id || manual.branch_id;
    const currentZone = branchById.get(manual.branch_id)?.timezone || "America/Fortaleza";
    const nextZone = branchById.get(nextBranchId)?.timezone || currentZone;
    const iso = manual.entry_timestamp ? localDateTimeToIso(manual.entry_timestamp, currentZone) : new Date().toISOString();
    setManual({
      ...manual,
      employee_id: employeeId,
      branch_id: nextBranchId,
      entry_timestamp: formatDateTimeInput(iso, nextZone)
    });
  }

  async function saveAdjustment() {
    if (!selected || !adjustment) return;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      await adminFetch("/api/admin/time-entries", {
        method: "PATCH",
        body: JSON.stringify({
          id: selected.id,
          ...adjustment,
          entry_timestamp: localDateTimeToIso(adjustment.entry_timestamp, adjustment.timezone),
          entry_date: adjustment.entry_timestamp.slice(0, 10)
        })
      });
      setMessage("Marcação ajustada com histórico e auditoria.");
      setSelected(null);
      setAdjustment(null);
      await load();
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Erro ao ajustar a marcação.");
    } finally {
      setLoading(false);
    }
  }

  async function saveManual() {
    if (!manual) return;
    const branch = branchById.get(manual.branch_id);
    const timeZone = branch?.timezone || "America/Fortaleza";
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const timestamp = localDateTimeToIso(manual.entry_timestamp, timeZone);
      await adminFetch("/api/admin/time-entries", {
        method: "POST",
        body: JSON.stringify({
          ...manual,
          entry_timestamp: timestamp,
          entry_date: manual.entry_timestamp.slice(0, 10),
          late_minutes: Number(manual.late_minutes || 0),
          early_leave_minutes: Number(manual.early_leave_minutes || 0)
        })
      });
      setMessage("Marcação manual adicionada em transação e vinculada à jornada.");
      setManualOpen(false);
      setManual(null);
      await load();
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Erro ao adicionar a marcação manual.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AdminShell>
      <SectionTitle
        title="Registros de ponto"
        description="Consulte, ajuste ou adicione marcações com competência, fuso da filial, motivo e auditoria."
      />

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          <Field label="Filial">
            <Select value={filters.branchId || ""} onChange={(event) => setFilters({ ...filters, branchId: event.target.value })}>
              <option value="">Todas</option>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </Select>
          </Field>
          <Field label="Funcionário">
            <Select value={filters.employeeId || ""} onChange={(event) => setFilters({ ...filters, employeeId: event.target.value })}>
              <option value="">Todos</option>
              {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}
            </Select>
          </Field>
          <Field label="Início">
            <Input type="date" value={filters.startDate || ""} onChange={(event) => setFilters({ ...filters, startDate: event.target.value })} />
          </Field>
          <Field label="Fim">
            <Input type="date" value={filters.endDate || ""} onChange={(event) => setFilters({ ...filters, endDate: event.target.value })} />
          </Field>
          <Field label="Status">
            <Select value={filters.status || ""} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
              <option value="">Todos</option>
              {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </Field>
          <Field label="Ocorrência">
            <Select value={filters.occurrenceType || ""} onChange={(event) => setFilters({ ...filters, occurrenceType: event.target.value })}>
              <option value="">Todas</option>
              <option value="late">Atraso</option>
              <option value="early_leave">Saída antecipada</option>
              <option value="outside_radius">Fora do raio</option>
            </Select>
          </Field>
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button onClick={() => void load()} loading={loading}>Aplicar filtros</Button>
          <Button variant="secondary" onClick={openManualForm} disabled={!employees.length || !branches.length}>
            <Plus className="h-4 w-4" /> Adicionar marcação manual
          </Button>
        </div>
      </Card>

      {message ? <p className="mb-3 rounded-xl bg-emerald-50 p-3 font-bold text-emerald-800" role="status">{message}</p> : null}
      {error ? <p className="mb-3 rounded-xl bg-red-50 p-3 font-bold text-red-800" role="alert">{error}</p> : null}

      {manualOpen && manual ? (
        <Card className="mb-4 border-brand-200 bg-brand-50/70">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="font-black text-brand-950">Nova marcação manual</h2>
              <p className="mt-1 text-sm text-slate-600">O motivo é obrigatório. A operação é idempotente, transacional e bloqueada em competência fechada.</p>
            </div>
            <Button size="sm" variant="ghost" aria-label="Fechar formulário" onClick={() => { setManualOpen(false); setManual(null); }}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Field label="Funcionário">
              <Select value={manual.employee_id} onChange={(event) => updateManualEmployee(event.target.value)}>
                <option value="">Selecione</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>{employee.full_name}{employee.registration_code ? ` · ${employee.registration_code}` : ""}</option>
                ))}
              </Select>
            </Field>
            <Field label="Filial">
              <Select value={manual.branch_id} onChange={(event) => setManual({ ...manual, branch_id: event.target.value })}>
                <option value="">Selecione</option>
                {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </Select>
            </Field>
            <Field label="Tipo de marcação">
              <Select value={manual.action} onChange={(event) => setManual({ ...manual, action: event.target.value as TimeAction })}>
                {Object.entries(actionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Select>
            </Field>
            <Field label={`Data/hora · ${branchById.get(manual.branch_id)?.timezone || "fuso da filial"}`}>
              <Input type="datetime-local" value={manual.entry_timestamp} onChange={(event) => setManual({ ...manual, entry_timestamp: event.target.value })} />
            </Field>
            <Field label="Atraso (minutos)">
              <Input type="number" min={0} max={1440} value={manual.late_minutes} onChange={(event) => setManual({ ...manual, late_minutes: event.target.value })} />
            </Field>
            <Field label="Saída antecipada (minutos)">
              <Input type="number" min={0} max={1440} value={manual.early_leave_minutes} onChange={(event) => setManual({ ...manual, early_leave_minutes: event.target.value })} />
            </Field>
            <div className="sm:col-span-2 xl:col-span-3">
              <Field label="Motivo obrigatório">
                <Textarea value={manual.adjustment_reason} onChange={(event) => setManual({ ...manual, adjustment_reason: event.target.value })} placeholder="Explique por que a marcação está sendo criada manualmente." />
              </Field>
            </div>
            <div className="sm:col-span-2 xl:col-span-3">
              <Field label="Observação/justificativa">
                <Textarea value={manual.justification_text} onChange={(event) => setManual({ ...manual, justification_text: event.target.value })} placeholder="Opcional" />
              </Field>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button
              loading={loading}
              disabled={!manual.employee_id || !manual.branch_id || !manual.entry_timestamp || manual.adjustment_reason.trim().length < 5}
              onClick={() => void saveManual()}
            >
              <Save className="h-4 w-4" /> Salvar marcação
            </Button>
            <Button variant="ghost" onClick={() => { setManualOpen(false); setManual(null); }}>Cancelar</Button>
          </div>
        </Card>
      ) : null}

      {selected && adjustment ? (
        <Card className="mb-4 border-amber-200 bg-amber-50">
          <h2 className="mb-1 font-black text-amber-950">Ajuste auditado</h2>
          <p className="mb-3 text-sm text-amber-900/80">O registro original será preservado e substituído em uma transação.</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Field label="Data/hora">
              <Input value={adjustment.entry_timestamp} type="datetime-local" onChange={(event) => setAdjustment({ ...adjustment, entry_timestamp: event.target.value })} />
            </Field>
            <Field label="Ação">
              <Select value={adjustment.action} onChange={(event) => setAdjustment({ ...adjustment, action: event.target.value as TimeAction })}>
                {Object.entries(actionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Select>
            </Field>
            <Field label="Status">
              <Select value={adjustment.status} onChange={(event) => setAdjustment({ ...adjustment, status: event.target.value as TimeEntryStatus })}>
                {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Select>
            </Field>
            <Field label="Atraso (min)">
              <Input type="number" min={0} value={adjustment.late_minutes} onChange={(event) => setAdjustment({ ...adjustment, late_minutes: event.target.value })} />
            </Field>
            <Field label="Saída antecipada (min)">
              <Input type="number" min={0} value={adjustment.early_leave_minutes} onChange={(event) => setAdjustment({ ...adjustment, early_leave_minutes: event.target.value })} />
            </Field>
            <Field label="Motivo do ajuste">
              <Textarea value={adjustment.adjustment_reason} onChange={(event) => setAdjustment({ ...adjustment, adjustment_reason: event.target.value })} />
            </Field>
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button loading={loading} disabled={adjustment.adjustment_reason.trim().length < 5} onClick={() => void saveAdjustment()}>
              <Save className="h-4 w-4" /> Salvar ajuste
            </Button>
            <Button variant="ghost" onClick={() => { setSelected(null); setAdjustment(null); }}>Cancelar</Button>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-3 lg:hidden">
        {entries.map((entry) => {
          const gps = gpsLabel(entry.inside_allowed_radius, entry.distance_meters);
          return (
            <Card key={entry.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-black text-slate-950">{entry.employees?.full_name || "Funcionário"}</p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><MapPin className="h-3.5 w-3.5" /> {entry.branches?.name || "Filial"}</p>
                </div>
                <Badge tone={entry.status === "valid" ? "green" : entry.status === "blocked" ? "red" : "yellow"}>{statusLabels[entry.status] || entry.status}</Badge>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-sm">
                <div><span className="block text-xs text-slate-500">Ação</span><strong>{actionLabels[entry.action]}</strong></div>
                <div><span className="block text-xs text-slate-500">Data/hora</span><strong>{formatEntryDate(entry.entry_timestamp, entry.branches?.timezone)}</strong></div>
                <div><span className="block text-xs text-slate-500">GPS</span><Badge tone={gps.tone}>{gps.label}</Badge></div>
                <div><span className="block text-xs text-slate-500">Ocorrências</span><strong>{entry.late_minutes ? `${entry.late_minutes} min atraso` : entry.early_leave_minutes ? `${entry.early_leave_minutes} min saída` : "Sem alerta"}</strong></div>
              </div>
              <Button className="mt-3 w-full" variant="ghost" onClick={() => choose(entry)}>Ajustar marcação</Button>
            </Card>
          );
        })}
      </div>

      <Card className="hidden lg:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <th className="p-3">Funcionário</th><th className="p-3">Filial</th><th className="p-3">Ação</th><th className="p-3">Data/Hora</th>
                <th className="p-3">Status</th><th className="p-3">GPS</th><th className="p-3">Atraso</th><th className="p-3">Saída ant.</th><th className="p-3">Ação</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const gps = gpsLabel(entry.inside_allowed_radius, entry.distance_meters);
                return (
                  <tr key={entry.id} className="border-b border-slate-100 hover:bg-slate-50/70">
                    <td className="p-3 font-bold"><span className="inline-flex items-center gap-2"><UserRound className="h-4 w-4 text-slate-400" />{entry.employees?.full_name || "-"}</span></td>
                    <td className="p-3">{entry.branches?.name || "-"}</td>
                    <td className="p-3">{actionLabels[entry.action]}</td>
                    <td className="p-3"><span className="inline-flex items-center gap-2"><Clock3 className="h-4 w-4 text-slate-400" />{formatEntryDate(entry.entry_timestamp, entry.branches?.timezone)}</span></td>
                    <td className="p-3"><Badge tone={entry.status === "valid" ? "green" : entry.status === "blocked" ? "red" : "yellow"}>{statusLabels[entry.status] || entry.status}</Badge></td>
                    <td className="p-3"><Badge tone={gps.tone}>{gps.label}</Badge></td>
                    <td className="p-3">{minutesToHourText(entry.late_minutes)}</td>
                    <td className="p-3">{minutesToHourText(entry.early_leave_minutes)}</td>
                    <td className="p-3"><Button size="sm" variant="ghost" onClick={() => choose(entry)}>Ajustar</Button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {!loading && !entries.length ? (
        <Card className="mt-3 text-center"><p className="font-bold text-slate-700">Nenhuma marcação encontrada para os filtros informados.</p></Card>
      ) : null}
    </AdminShell>
  );
}
