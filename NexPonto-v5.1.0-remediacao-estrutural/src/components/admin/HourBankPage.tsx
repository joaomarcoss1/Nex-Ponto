"use client";

import { RotateCcw, TimerReset } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, SectionTitle, StatCard } from "@/components/ui/card";
import { adminFetch } from "@/lib/client/admin-api";
import { minutesToHourText } from "@/lib/format";

interface Employee { id: string; full_name: string; branch_id: string }
interface Branch { id: string; name: string }
interface Movement { id: string; employee_id: string; branch_id: string; movement_date: string; minutes: number; movement_type: string; reason: string; balance_before?: number; balance_after?: number; status?: string; reversal_of?: string | null; employees?: { full_name?: string }; branches?: { name?: string } }

export function HourBankPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [form, setForm] = useState({ employee_id: "", branch_id: "", movement_date: new Date().toISOString().slice(0,10), minutes: 60, movement_type: "credit", reason: "", expires_on: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const [employeeData, branchData, movementData] = await Promise.all([
      adminFetch<{ employees: Employee[] }>("/api/admin/employees?status=active"),
      adminFetch<{ branches: Branch[] }>("/api/admin/branches?status=active"),
      adminFetch<{ movements: Movement[] }>("/api/admin/hour-bank")
    ]);
    setEmployees(employeeData.employees || []); setBranches(branchData.branches || []); setMovements(movementData.movements || []);
  }
  useEffect(() => { void load().catch((cause: Error) => setError(cause.message)); }, []);
  const selectedEmployee = employees.find((employee) => employee.id === form.employee_id);
  useEffect(() => { if (selectedEmployee) setForm((current) => ({ ...current, branch_id: selectedEmployee.branch_id })); }, [selectedEmployee]);
  const totalBalance = useMemo(() => {
    const latest = new Map<string, number>();
    for (const movement of [...movements].reverse()) latest.set(movement.employee_id, Number(movement.balance_after ?? 0));
    return [...latest.values()].reduce((sum, value) => sum + value, 0);
  }, [movements]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(""); setMessage("");
    try { await adminFetch("/api/admin/hour-bank", { method: "POST", body: JSON.stringify({ ...form, expires_on: form.expires_on || null }) }); setMessage("Movimento registrado no ledger imutável."); setForm((current) => ({ ...current, minutes: 60, reason: "" })); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Erro ao registrar movimento."); }
    finally { setSaving(false); }
  }

  async function reverse(movement: Movement) {
    const reason = window.prompt("Informe o motivo obrigatório do estorno:");
    if (!reason) return;
    await adminFetch("/api/admin/hour-bank", { method: "DELETE", body: JSON.stringify({ id: movement.id, reason }) });
    setMessage("Estorno registrado como novo movimento. O histórico original foi preservado."); await load();
  }

  return <AdminShell>
    <SectionTitle title="Banco de horas" description="Ledger imutável: créditos e débitos nunca são editados. Correções geram estorno e novo histórico auditável." />
    {error ? <p className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">{error}</p> : null}
    {message ? <p className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{message}</p> : null}
    <div className="mb-5 grid gap-3 sm:grid-cols-3"><StatCard label="Movimentos" value={movements.length} /><StatCard label="Saldo consolidado" value={minutesToHourText(totalBalance)} tone={totalBalance >= 0 ? "green" : "red"} /><StatCard label="Funcionários" value={new Set(movements.map((item) => item.employee_id)).size} tone="blue" /></div>
    <div className="grid gap-5 xl:grid-cols-[390px_1fr]">
      <Card><form className="grid gap-3" onSubmit={submit}><h2 className="flex items-center gap-2 text-lg font-black"><TimerReset className="h-5 w-5 text-brand-700" />Novo lançamento</h2>
        <label className="grid gap-1 text-sm font-bold">Funcionário<select className="min-h-11 rounded-xl border border-slate-200 px-3" required value={form.employee_id} onChange={(event) => setForm({ ...form, employee_id: event.target.value })}><option value="">Selecione</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}</select></label>
        <label className="grid gap-1 text-sm font-bold">Filial<select className="min-h-11 rounded-xl border border-slate-200 px-3" required value={form.branch_id} onChange={(event) => setForm({ ...form, branch_id: event.target.value })}>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
        <div className="grid grid-cols-2 gap-3"><label className="grid gap-1 text-sm font-bold">Data<input type="date" className="min-h-11 rounded-xl border border-slate-200 px-3" value={form.movement_date} onChange={(event) => setForm({ ...form, movement_date: event.target.value })} /></label><label className="grid gap-1 text-sm font-bold">Minutos<input type="number" min="1" className="min-h-11 rounded-xl border border-slate-200 px-3" value={form.minutes} onChange={(event) => setForm({ ...form, minutes: Number(event.target.value) })} /></label></div>
        <label className="grid gap-1 text-sm font-bold">Tipo<select className="min-h-11 rounded-xl border border-slate-200 px-3" value={form.movement_type} onChange={(event) => setForm({ ...form, movement_type: event.target.value })}><option value="credit">Crédito</option><option value="debit">Débito</option><option value="compensation">Compensação</option><option value="manual_adjustment">Ajuste fundamentado</option></select></label>
        <label className="grid gap-1 text-sm font-bold">Motivo<textarea className="min-h-24 rounded-xl border border-slate-200 p-3" required minLength={5} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></label>
        <label className="grid gap-1 text-sm font-bold">Validade opcional<input type="date" className="min-h-11 rounded-xl border border-slate-200 px-3" value={form.expires_on} onChange={(event) => setForm({ ...form, expires_on: event.target.value })} /></label>
        <Button type="submit" loading={saving}>Registrar movimento</Button>
      </form></Card>
      <div className="grid content-start gap-3">{movements.map((movement) => <Card key={movement.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="truncate font-black text-slate-950">{movement.employees?.full_name || "Funcionário"}</p><p className="text-sm font-semibold text-slate-600">{movement.branches?.name || "Filial"} · {movement.movement_date}</p><p className="mt-1 text-sm text-slate-500">{movement.reason}</p><div className="mt-2 flex flex-wrap gap-2"><Badge tone={Number(movement.minutes) >= 0 ? "green" : "red"}>{minutesToHourText(movement.minutes)}</Badge><Badge tone="neutral">Saldo: {minutesToHourText(Number(movement.balance_after ?? 0))}</Badge>{movement.reversal_of ? <Badge tone="yellow">Estorno</Badge> : null}</div></div>{!movement.reversal_of ? <Button size="sm" variant="ghost" onClick={() => void reverse(movement)}><RotateCcw className="h-4 w-4" />Estornar</Button> : null}</Card>)}{!movements.length ? <Card className="grid min-h-44 place-items-center text-sm font-bold text-slate-500">Nenhum movimento registrado.</Card> : null}</div>
    </div>
  </AdminShell>;
}
