"use client";

import { AlertTriangle, Building2, CalendarCheck2, Clock3, FileCheck2, TrendingUp, Users, WalletCards } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button, buttonClassName } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { ToastMessage } from "@/components/ui/feedback";
import { adminFetch } from "@/lib/client/admin-api";
import { formatMoney } from "@/lib/format";

const detailedCardConfig = [
  ["activeEmployees", "Funcionários ativos", Users],
  ["branches", "Filiais ativas", Building2],
  ["punchesToday", "Pontos hoje", Clock3],
  ["absentToday", "Ausentes hoje", AlertTriangle],
  ["pendingJustifications", "Justificativas pendentes", FileCheck2],
  ["lateToday", "Atrasos hoje", TrendingUp],
  ["earlyLeaveToday", "Saídas antecipadas", AlertTriangle],
  ["pendingOvertime", "Horas extras pendentes", Clock3],
  ["overtimePeriod", "Horas extras período", Clock3],
  ["estimatedPayroll", "Folha estimada", WalletCards],
  ["openPayrolls", "Folhas abertas", FileCheck2],
  ["closedPayrolls", "Folhas fechadas", FileCheck2],
  ["inconsistencyAlerts", "Alertas", AlertTriangle],
] as const;

const summaryCards = [
  ["activeEmployees", "Funcionários ativos", Users],
  ["activeBranches", "Filiais ativas", Building2],
  ["pointsToday", "Pontos hoje", Clock3],
  ["pendingReview", "Revisões pendentes", FileCheck2],
  ["outsideRadius", "Fora do raio", AlertTriangle],
  ["pendingHolidays", "Feriados pendentes", CalendarCheck2],
] as const;

function BarList({ data }: { data: Array<{ label: string; value: number }> }) {
  const max = Math.max(1, ...data.map((item) => item.value));
  return (
    <div className="grid gap-3">
      {data.map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex min-w-0 justify-between gap-3 text-xs font-bold text-slate-600">
            <span className="min-w-0 truncate">{item.label}</span>
            <span className="shrink-0">{item.value}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-2.5 rounded-full bg-gradient-to-r from-brand-700 via-brand-500 to-sun-400 transition-all duration-700" style={{ width: `${Math.max(6, (item.value / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DashboardPage() {
  const [summary, setSummary] = useState<any>(null);
  const [details, setDetails] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [error, setError] = useState("");
  const [holidayNotifications, setHolidayNotifications] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      adminFetch<any>("/api/admin/dashboard/summary?v=19"),
      adminFetch<any>("/api/admin/notifications?v=19")
    ])
      .then(([summaryData, notificationData]) => {
        setSummary(summaryData.summary || null);
        setHolidayNotifications((notificationData.notifications || []).filter((item: any) => item.notification_type === "holiday_decision" && !item.read_at));
      })
      .catch((err) => setError(err.message));
  }, []);

  async function loadDetails() {
    setLoadingDetails(true);
    setError("");
    try {
      const data = await adminFetch<any>("/api/admin/dashboard?v=18");
      setDetails(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar indicadores detalhados.");
    } finally {
      setLoadingDetails(false);
    }
  }

  return (
    <AdminShell>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <SectionTitle title="Dashboard" description="Resumo rápido para o painel abrir sem travamentos. Indicadores pesados são carregados somente quando solicitados." />
        <Button variant="secondary" loading={loadingDetails} onClick={loadDetails}>
          <TrendingUp className="h-4 w-4" />
          {details ? "Atualizar detalhes" : "Carregar detalhes"}
        </Button>
      </div>

      {error ? <ToastMessage type="error">{error}</ToastMessage> : null}

      {holidayNotifications.length ? (
        <Card className="mb-4 border-amber-300 bg-gradient-to-r from-amber-50 to-sun-50">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-amber-950"><CalendarCheck2 className="h-5 w-5" /><h2 className="font-black">Decisão de funcionamento pendente</h2></div>
              <div className="mt-2 grid gap-1 text-sm font-semibold text-amber-900">
                {holidayNotifications.slice(0, 3).map((notification) => <p key={notification.id}>{notification.message}</p>)}
                {holidayNotifications.length > 3 ? <p>Mais {holidayNotifications.length - 3} notificação(ões) pendente(s).</p> : null}
              </div>
            </div>
            <Link className={buttonClassName({ variant: "warning", className: "shrink-0" })} href="/admin/feriados">Definir funcionamento</Link>
          </div>
        </Card>
      ) : null}

      {!summary ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-3xl border border-slate-200 bg-white shadow-sm" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {summaryCards.map(([key, label, Icon]) => (
            <Card key={key} className="premium-surface">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-words text-xs font-black uppercase tracking-[0.10em] text-slate-500">{label}</p>
                  <p className="mt-2 text-3xl font-black tracking-[-0.04em] text-slate-950">{summary[key] ?? 0}</p>
                </div>
                <span className="shrink-0 rounded-2xl bg-gradient-to-br from-brand-50 to-sun-50 p-3 text-brand-700 shadow-inner">
                  <Icon className="h-5 w-5" />
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {details ? (
        <div className="mt-5 grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {detailedCardConfig.map(([key, label, Icon]) => (
              <Card key={key} className="premium-surface">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words text-xs font-black uppercase tracking-[0.10em] text-slate-500">{label}</p>
                    <p className="mt-2 text-3xl font-black tracking-[-0.04em] text-slate-950">
                      {key === "estimatedPayroll"
                        ? formatMoney(details.cards[key])
                        : key === "overtimePeriod"
                          ? `${Math.floor(details.cards[key] / 60)}h ${String(details.cards[key] % 60).padStart(2, "0")}min`
                          : details.cards[key]}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-2xl bg-gradient-to-br from-brand-50 to-sun-50 p-3 text-brand-700 shadow-inner">
                    <Icon className="h-5 w-5" />
                  </span>
                </div>
              </Card>
            ))}
          </div>

          {details.alerts?.length ? (
            <Card className="border-amber-200 bg-amber-50">
              <h2 className="mb-2 font-black text-amber-950">Alertas importantes</h2>
              <div className="grid gap-2 text-sm font-semibold text-amber-900">
                {details.alerts.map((alert: string) => <p key={alert}>{alert}</p>)}
              </div>
            </Card>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <h2 className="mb-3 font-black">Funcionários por filial</h2>
              <BarList data={(details.totalByBranch || []).map((item: any) => ({ label: item.branch, value: item.total }))} />
            </Card>
            <Card>
              <h2 className="mb-3 font-black">Atrasos por filial</h2>
              <BarList data={details.charts?.lateByBranch || []} />
            </Card>
            <Card>
              <h2 className="mb-3 font-black">Custo de folha por filial</h2>
              <BarList data={(details.charts?.payrollByBranch || []).map((item: any) => ({ label: item.label, value: Math.round(item.value) }))} />
            </Card>
            <Card>
              <h2 className="mb-3 font-black">Horas extras por funcionário</h2>
              <BarList data={(details.charts?.overtimeByEmployee || []).map((item: any) => ({ label: item.label, value: Math.round(item.value) }))} />
            </Card>
          </div>
        </div>
      ) : null}
    </AdminShell>
  );
}
