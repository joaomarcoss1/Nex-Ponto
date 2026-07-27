"use client";

import { AlertTriangle, CheckCircle2, ClipboardList, FileSpreadsheet, Lock, WalletCards } from "lucide-react";
import Link from "next/link";
import { AdminShell } from "@/components/admin/AdminShell";
import { buttonClassName } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";

const steps = [
  { title: "1. Selecionar período", text: "Defina mês, quinzena, filial ou todas as unidades permitidas.", icon: ClipboardList },
  { title: "2. Rodar checklist", text: "Confira justificativas, GPS, pontos fora do raio, horas extras e cadastros incompletos.", icon: AlertTriangle },
  { title: "3. Gerar folha", text: "A folha cria snapshot dos dados e respeita as permissões por filial.", icon: WalletCards },
  { title: "4. Fechar com segurança", text: "Pendências críticas bloqueiam o fechamento. Exceções exigem admin master e motivo formal.", icon: Lock },
  { title: "5. Exportar conferência", text: "PDF executivo e Excel detalhado ficam disponíveis para auditoria e pagamento.", icon: FileSpreadsheet }
];

export function ClosingPage() {
  return (
    <AdminShell>
      <div className="mb-5 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-start">
        <SectionTitle
          title="Fechamento mensal"
          description="Fluxo guiado para fechar o ponto e a folha do supermercado com segurança, auditoria e conferência por filial."
        />
        <Link className={buttonClassName({ className: "w-full lg:w-auto" })} href="/admin/folha">
          <WalletCards className="h-4 w-4" />
          Abrir folha
        </Link>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="admin-page-card">
          <h2 className="text-xl font-black text-slate-950">Checklist profissional de fechamento</h2>
          <p className="mt-2 text-sm font-semibold text-slate-600">
            Antes de fechar a folha, o sistema verifica inconsistências críticas. Resolva as pendências ou, no caso do admin master, registre uma exceção formal.
          </p>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {steps.map((step) => {
              const Icon = step.icon;
              return (
                <div key={step.title} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-700">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="font-black text-slate-950">{step.title}</h3>
                      <p className="mt-1 text-sm font-medium leading-relaxed text-slate-600">{step.text}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
        <Card className="admin-page-card">
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-1 h-6 w-6 text-emerald-700" />
              <div>
                <h2 className="font-black text-emerald-950">Regra de produção oficial</h2>
                <p className="mt-1 text-sm font-semibold leading-relaxed text-emerald-900">
                  RH e financeiro não fecham folha com pendência crítica. Somente o admin master pode fechar com exceção, sempre com justificativa registrada em auditoria.
                </p>
              </div>
            </div>
          </div>
          <div className="mt-4 grid gap-3 text-sm font-semibold text-slate-700">
            <p>• Gerentes visualizam apenas a própria filial.</p>
            <p>• Exportações financeiras exigem permissão e geram auditoria.</p>
            <p>• Pontos com GPS impreciso ou fora do raio entram na fila de revisão.</p>
            <p>• Folhas fechadas usam snapshot e não mudam com alterações futuras.</p>
          </div>
          <Link className={buttonClassName({ variant: "secondary", className: "mt-5 w-full" })} href="/admin/inconsistencias">
            <AlertTriangle className="h-4 w-4" />
            Ver inconsistências
          </Link>
        </Card>
      </div>
    </AdminShell>
  );
}
