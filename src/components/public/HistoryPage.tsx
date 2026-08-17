"use client";
import { publicFetch } from "@/lib/client/public-api";
import { apiErrorFromPayload } from "@/lib/client/api-error";

import { CalendarClock, FileText, History, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { EmployeeSearch } from "@/components/public/EmployeeSearch";
import { PinInput } from "@/components/public/PinInput";
import { PublicShell } from "@/components/public/PublicShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { actionLabels, statusLabels } from "@/lib/constants";
import { formatDateTime, minutesToHourText } from "@/lib/format";
import type { PublicEmployee, TimeAction, TimeEntryStatus } from "@/types/domain";

type HistoryPayload = {
  employee: { id: string; full_name: string; role: string; branch_name?: string };
  today: string;
  entriesToday: any[];
  recentEntries: any[];
  justifications: any[];
  summary: {
    totalEntries: number;
    pendingReviews: number;
    lateOccurrences: number;
    earlyLeaveOccurrences: number;
    pendingJustifications: number;
  };
};

function StatusBadge({ status }: { status: string }) {
  const tone = status === "valid" || status === "approved" ? "green" : status === "pending_review" || status === "pending" ? "yellow" : "red";
  return <Badge tone={tone as any}>{statusLabels[status as TimeEntryStatus] || status}</Badge>;
}

export function HistoryPage() {
  const [employee, setEmployee] = useState<PublicEmployee | null>(null);
  const [pin, setPin] = useState("");
  const [data, setData] = useState<HistoryPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadHistory() {
    if (!employee || pin.length !== 4) {
      setError("Selecione seu nome e informe o PIN com 4 dígitos.");
      return;
    }
    setLoading(true);
    setError("");
    setData(null);
    try {
      const response = await publicFetch("/api/public/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: employee.id, pin, deviceInfo: navigator.userAgent })
      });
      const payload = await response.json();
      if (!response.ok) throw apiErrorFromPayload(payload, response.status, "Não foi possível carregar seu histórico.");
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar histórico.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PublicShell eyebrow="Histórico" title="Meu histórico" subtitle="Consulte seus pontos, atrasos e justificativas sem entrar na área administrativa.">
      <div className="grid gap-4">
        <EmployeeSearch selected={employee} onSelect={(value) => { setEmployee(value); setData(null); }} />
        <PinInput value={pin} onChange={setPin} disabled={loading} />
        <Button size="lg" className="w-full rounded-2xl" disabled={loading || !employee || pin.length !== 4} onClick={loadHistory}>
          <History className="h-5 w-5" />
          Ver meu histórico
        </Button>
        {error ? <p className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">{error}</p> : null}

        {data ? (
          <div className="grid gap-4">
            <section className="rounded-3xl border border-brand-100 bg-brand-50 p-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-brand-700">Funcionário validado</p>
              <h2 className="mt-1 text-2xl font-black text-brand-950">{data.employee.full_name}</h2>
              <p className="text-sm font-semibold text-brand-800">{data.employee.role} • {data.employee.branch_name || "Filial"}</p>
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 text-center sm:grid-cols-5">
                <div className="rounded-2xl bg-white p-3 shadow-sm"><strong className="block text-xl text-brand-800">{data.summary.totalEntries}</strong><span className="text-[11px] font-bold text-slate-500">Pontos</span></div>
                <div className="rounded-2xl bg-white p-3 shadow-sm"><strong className="block text-xl text-amber-700">{data.summary.pendingReviews}</strong><span className="text-[11px] font-bold text-slate-500">Revisões</span></div>
                <div className="rounded-2xl bg-white p-3 shadow-sm"><strong className="block text-xl text-red-700">{data.summary.lateOccurrences}</strong><span className="text-[11px] font-bold text-slate-500">Atrasos</span></div>
                <div className="rounded-2xl bg-white p-3 shadow-sm"><strong className="block text-xl text-orange-700">{data.summary.earlyLeaveOccurrences}</strong><span className="text-[11px] font-bold text-slate-500">Saídas ant.</span></div>
                <div className="rounded-2xl bg-white p-3 shadow-sm"><strong className="block text-xl text-amber-700">{data.summary.pendingJustifications}</strong><span className="text-[11px] font-bold text-slate-500">Justif. pend.</span></div>
              </div>
            </section>

            <Card className="animate-fade-in border-brand-100">
              <div className="mb-3 flex items-center gap-2">
                <CalendarClock className="h-5 w-5 text-brand-700" />
                <h3 className="font-black text-slate-950">Pontos de hoje</h3>
              </div>
              <div className="grid gap-2">
                {data.entriesToday.map((entry) => (
                  <div key={entry.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <strong className="text-sm text-slate-950">{actionLabels[entry.action as TimeAction] || entry.action}</strong>
                      <StatusBadge status={entry.status} />
                    </div>
                    <p className="mt-1 text-xs font-semibold text-slate-600">{formatDateTime(entry.entry_timestamp)} • {entry.branch_name || "Filial"}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      Distância: {entry.distance_meters ?? "-"}m • Atraso: {minutesToHourText(entry.late_minutes || 0)} • Saída ant.: {minutesToHourText(entry.early_leave_minutes || 0)}
                    </p>
                    {entry.justification_text ? <p className="mt-2 rounded-xl bg-white p-2 text-xs font-semibold text-slate-600">Justificativa: {entry.justification_text}</p> : null}
                  </div>
                ))}
                {!data.entriesToday.length ? <p className="rounded-2xl bg-slate-50 p-4 text-center text-sm font-semibold text-slate-500">Nenhum ponto registrado hoje.</p> : null}
              </div>
            </Card>

            <Card className="animate-fade-in border-brand-100">
              <div className="mb-3 flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-brand-700" />
                <h3 className="font-black text-slate-950">Últimos registros</h3>
              </div>
              <div className="grid gap-2">
                {data.recentEntries.map((entry) => (
                  <div key={entry.id} className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between rounded-2xl bg-white p-3 ring-1 ring-slate-100">
                    <div>
                      <strong className="text-sm text-slate-950">{actionLabels[entry.action as TimeAction] || entry.action}</strong>
                      <p className="text-xs font-semibold text-slate-600">{formatDateTime(entry.entry_timestamp)} • {entry.branch_name || "Filial"}</p>
                    </div>
                    <StatusBadge status={entry.status} />
                  </div>
                ))}
              </div>
            </Card>

            <Card className="animate-fade-in border-brand-100">
              <div className="mb-3 flex items-center gap-2">
                <FileText className="h-5 w-5 text-brand-700" />
                <h3 className="font-black text-slate-950">Justificativas enviadas</h3>
              </div>
              <div className="grid gap-2">
                {data.justifications.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <strong className="text-sm text-slate-950">Falta em {item.absence_date}</strong>
                      <StatusBadge status={item.status} />
                    </div>
                    <p className="mt-2 text-xs font-semibold text-slate-600">{item.justification_text}</p>
                    {item.admin_observation ? <p className="mt-2 rounded-xl bg-white p-2 text-xs font-semibold text-slate-600">RH: {item.admin_observation}</p> : null}
                    {item.attachment_url ? <p className="mt-1 text-xs font-bold text-brand-700">Anexo enviado</p> : null}
                  </div>
                ))}
                {!data.justifications.length ? <p className="rounded-2xl bg-slate-50 p-4 text-center text-sm font-semibold text-slate-500">Nenhuma justificativa enviada no período recente.</p> : null}
              </div>
            </Card>
          </div>
        ) : null}
      </div>
    </PublicShell>
  );
}
