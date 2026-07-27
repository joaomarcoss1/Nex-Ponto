"use client";

import { AlertTriangle, Building2, CalendarDays, CheckCircle2, Clock3, Coffee, MapPin, UserCheck, UserRoundX, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Card, SectionTitle, StatCard } from "@/components/ui/card";
import { adminFetch } from "@/lib/client/admin-api";

interface DashboardData {
  cards: {
    activeEmployees: number;
    punchesToday: number;
    absentToday: number;
    pendingJustifications: number;
    lateToday: number;
    earlyLeaveToday: number;
    pendingOvertime: number;
    inconsistencyAlerts: number;
    presentToday?: number;
    onBreakToday?: number;
    missingBreakReturn?: number;
    branchOpen?: boolean | null;
  };
  alerts: string[];
}
interface GeoRow { id: string; inside_allowed_radius: boolean | null; gps_accuracy_meters?: number | null; employees?: { full_name?: string }; branches?: { name?: string } }

const quickActions = [
  { href: "/admin/planejamento-escalas", label: "Planejar escala", icon: CalendarDays },
  { href: "/admin/solicitacoes", label: "Aprovar pedidos", icon: UserCheck },
  { href: "/admin/pontos", label: "Consultar pontos", icon: Clock3 },
  { href: "/admin/justificativas", label: "Revisar justificativas", icon: CheckCircle2 }
];

export function BranchManagerPage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [geoRows, setGeoRows] = useState<GeoRow[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([
      adminFetch<DashboardData>("/api/admin/dashboard"),
      adminFetch<{ rows: GeoRow[] }>("/api/admin/geo-report")
    ]).then(([dashboardData, geoData]) => { setDashboard(dashboardData); setGeoRows(geoData.rows || []); }).catch((cause: Error) => setError(cause.message));
  }, []);

  const cards = dashboard?.cards;
  const geoSummary = useMemo(() => ({
    outside: geoRows.filter((row) => row.inside_allowed_radius === false).length,
    withoutGps: geoRows.filter((row) => row.inside_allowed_radius === null).length,
    poorAccuracy: geoRows.filter((row) => Number(row.gps_accuracy_meters || 0) > 100).length
  }), [geoRows]);

  return (
    <AdminShell>
      <SectionTitle title="Operação da filial" description="Painel móvel do gerente com presença, intervalos, ausências, geolocalização e atalhos para decisões do dia." />
      {error ? <p className="mb-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">{error}</p> : null}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-6">
        <StatCard label="Equipe ativa" value={cards?.activeEmployees ?? "–"} />
        <StatCard label="Presentes" value={cards?.presentToday ?? cards?.punchesToday ?? "–"} tone="green" />
        <StatCard label="Atrasados" value={cards?.lateToday ?? "–"} tone="yellow" />
        <StatCard label="Em intervalo" value={cards?.onBreakToday ?? "–"} tone="blue" />
        <StatCard label="Sem retorno" value={cards?.missingBreakReturn ?? "–"} tone="red" />
        <StatCard label="Ausentes" value={cards?.absentToday ?? "–"} tone="red" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {quickActions.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className="group flex min-h-24 flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_12px_34px_rgba(15,23,42,.05)] transition hover:-translate-y-0.5 hover:border-brand-200 hover:bg-brand-50"><Icon className="h-5 w-5 text-brand-700" /><span className="mt-3 text-sm font-black text-slate-800 group-hover:text-brand-900">{label}</span></Link>)}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-black text-slate-950"><Building2 className="mr-2 inline h-5 w-5 text-brand-700" />Alertas operacionais</h2><Badge tone={cards?.branchOpen === false ? "red" : cards?.branchOpen === true ? "green" : "neutral"}>{cards?.branchOpen === false ? "Unidade fechada" : cards?.branchOpen === true ? "Unidade aberta" : "Horário não definido"}</Badge></div>
          <div className="grid gap-2">
            {(dashboard?.alerts || []).map((alert) => <div key={alert} className="flex gap-3 rounded-2xl border border-amber-100 bg-amber-50 p-3 text-sm font-bold text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{alert}</div>)}
            {!dashboard?.alerts?.length ? <div className="flex gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-bold text-emerald-800"><CheckCircle2 className="h-5 w-5" />Nenhum alerta crítico neste momento.</div> : null}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl bg-slate-50 p-3"><Users className="h-4 w-4 text-slate-500" /><p className="mt-2 text-xs font-black uppercase text-slate-500">Pontos</p><p className="text-xl font-black">{cards?.punchesToday ?? "–"}</p></div>
            <div className="rounded-2xl bg-slate-50 p-3"><Coffee className="h-4 w-4 text-slate-500" /><p className="mt-2 text-xs font-black uppercase text-slate-500">Pendências</p><p className="text-xl font-black">{cards?.pendingJustifications ?? "–"}</p></div>
            <div className="rounded-2xl bg-slate-50 p-3"><UserRoundX className="h-4 w-4 text-slate-500" /><p className="mt-2 text-xs font-black uppercase text-slate-500">Inconsistências</p><p className="text-xl font-black">{cards?.inconsistencyAlerts ?? "–"}</p></div>
            <div className="rounded-2xl bg-slate-50 p-3"><MapPin className="h-4 w-4 text-slate-500" /><p className="mt-2 text-xs font-black uppercase text-slate-500">Fora do raio</p><p className="text-xl font-black">{geoSummary.outside}</p></div>
          </div>
        </Card>
        <Card>
          <h2 className="mb-3 text-xl font-black text-slate-950">Geolocalização recente</h2>
          <div className="mb-3 flex flex-wrap gap-2"><Badge tone="red">{geoSummary.outside} fora</Badge><Badge tone="yellow">{geoSummary.poorAccuracy} imprecisos</Badge><Badge tone="neutral">{geoSummary.withoutGps} sem GPS</Badge></div>
          <div className="grid gap-2">
            {geoRows.slice(0, 7).map((row) => <div key={row.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3 text-sm"><div className="min-w-0"><p className="truncate font-bold text-slate-700">{row.employees?.full_name || "Funcionário"}</p><p className="truncate text-xs text-slate-500">{row.branches?.name || "Filial"}</p></div><Badge tone={row.inside_allowed_radius === true ? "green" : row.inside_allowed_radius === false ? "red" : "neutral"}>{row.inside_allowed_radius === true ? "Dentro" : row.inside_allowed_radius === false ? "Fora" : "Sem GPS"}</Badge></div>)}
            {!geoRows.length ? <p className="rounded-2xl bg-slate-50 p-4 text-center text-sm text-slate-500">Nenhuma ocorrência recente.</p> : null}
          </div>
        </Card>
      </div>
    </AdminShell>
  );
}
