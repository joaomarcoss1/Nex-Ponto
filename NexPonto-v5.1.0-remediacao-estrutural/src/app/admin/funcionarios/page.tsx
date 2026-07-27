"use client";

import Link from "next/link";
import { Download, FileUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  ResourceManager,
  activeBadge,
} from "@/components/admin/ResourceManager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { adminFetch, downloadAdminFile } from "@/lib/client/admin-api";
import { formatMoney } from "@/lib/format";

const financialFieldNames = new Set([
  "monthly_salary",
  "daily_rate",
  "salary_valid_from",
  "salary_change_reason",
  "daily_rate_mode",
  "pix_key",
  "bank_name",
  "bank_agency",
  "bank_account",
  "bank_account_type",
  "payment_day",
]);

const baseFields = [
  { name: "registration_code", label: "Matrícula/código interno" },
  { name: "full_name", label: "Nome completo", required: true },
  { name: "document", label: "CPF/documento" },
  { name: "phone", label: "Telefone" },
  { name: "role", label: "Cargo", required: true },
  { name: "sector", label: "Setor" },
  {
    name: "branch_id",
    label: "Filial vinculada",
    type: "select" as const,
    optionsEndpoint: "/api/admin/branches?status=active",
    optionsKey: "branches",
    optionLabel: "name",
  },
  {
    name: "employment_type",
    label: "Tipo de contratação",
    type: "select" as const,
    options: [
      { label: "Mensalista", value: "mensalista" },
      { label: "Quinzenal", value: "quinzenal" },
      { label: "Diarista", value: "diarista" },
    ],
  },
  { name: "monthly_salary", label: "Salário mensal", type: "number" as const },
  { name: "daily_rate", label: "Valor da diária", type: "number" as const },
  {
    name: "salary_valid_from",
    label: "Vigência do novo salário",
    type: "date" as const,
  },
  { name: "salary_change_reason", label: "Motivo da alteração salarial" },
  {
    name: "daily_rate_mode",
    label: "Cálculo da diária",
    type: "select" as const,
    options: [
      { label: "Automático", value: "automatic" },
      { label: "Manual", value: "manual" },
    ],
  },
  { name: "pix_key", label: "Chave Pix" },
  { name: "bank_name", label: "Banco" },
  { name: "bank_agency", label: "Agência" },
  { name: "bank_account", label: "Conta" },
  { name: "bank_account_type", label: "Tipo de conta" },
  { name: "payment_day", label: "Dia de pagamento", type: "number" as const },
  {
    name: "pin",
    label: "PIN de 4 dígitos",
    type: "password" as const,
    hiddenOnEdit: false,
  },
  { name: "admission_date", label: "Data de admissão", type: "date" as const },
  { name: "termination_date", label: "Data de desligamento", type: "date" as const },
  {
    name: "expected_start_time",
    label: "Entrada prevista",
    type: "time" as const,
  },
  { name: "expected_end_time", label: "Saída prevista", type: "time" as const },
  {
    name: "expected_daily_minutes",
    label: "Carga diária (min)",
    type: "number" as const,
  },
  {
    name: "expected_lunch_minutes",
    label: "Almoço esperado (min)",
    type: "number" as const,
  },
  { name: "expected_lunch_start_time", label: "Saída para almoço", type: "time" as const },
  { name: "expected_lunch_end_time", label: "Retorno do almoço", type: "time" as const },
  { name: "work_days", label: "Dias trabalhados (0=dom, 6=sáb)" },
  {
    name: "allow_overtime",
    label: "Permitir hora extra",
    type: "checkbox" as const,
  },
  { name: "active", label: "Funcionário ativo", type: "checkbox" as const },
];

function buildColumns(canFinancial: boolean) {
  const columns = [
    {
      key: "registration_code",
      label: "Matrícula",
      render: (item: any) => item.registration_code || "-",
    },
    { key: "full_name", label: "Funcionário" },
    { key: "sector", label: "Setor", render: (item: any) => item.sector || "-" },
    { key: "role", label: "Cargo" },
    {
      key: "branches",
      label: "Filial",
      render: (item: any) => item.branches?.name || "-",
    },
    { key: "employment_type", label: "Contrato" },
    { key: "payment_day", label: "Pagamento", render: (item: any) => item.payment_day ? `Dia ${item.payment_day}` : canFinancial ? "Não definido" : "Restrito" },
    {
      key: "monthly_salary",
      label: "Salário",
      render: (item: any) => formatMoney(item.monthly_salary),
    },
    {
      key: "alerts",
      label: "Alertas",
      render: (item: any) => {
        const salaryHidden = item.monthly_salary === null && item.daily_rate === null;
        const alerts = [
          !item.branch_id && "Sem filial",
          canFinancial && !salaryHidden && !Number(item.monthly_salary || item.daily_rate || 0) && "Sem salário",
          item.has_pin === false && "Sem PIN",
          canFinancial && !item.payment_day && "Sem dia pag.",
          !item.expected_start_time && "Sem entrada",
          !item.expected_end_time && "Sem saída",
          !item.expected_lunch_start_time && "Sem almoço",
          !item.expected_lunch_end_time && "Sem retorno",
          !item.work_days?.length && "Sem escala",
        ].filter(Boolean);
        return alerts.length ? (
          <div className="flex flex-wrap gap-1">
            {alerts.map((alert) => (
              <Badge key={String(alert)} tone="yellow">
                {alert}
              </Badge>
            ))}
          </div>
        ) : (
          <Badge tone="green">Completo</Badge>
        );
      },
    },
    {
      key: "employee_salary_history",
      label: "Hist. salarial",
      render: (item: any) => {
        const history = item.employee_salary_history || [];
        return history.length ? `${history.length} registro(s)` : "Sem histórico";
      },
    },
    { key: "expected_start_time", label: "Entrada" },
    { key: "expected_lunch_start_time", label: "Almoço", render: (item: any) => item.expected_lunch_start_time || "-" },
    { key: "expected_lunch_end_time", label: "Retorno", render: (item: any) => item.expected_lunch_end_time || "-" },
    { key: "expected_end_time", label: "Saída" },
    {
      key: "active",
      label: "Status",
      render: (item: any) => activeBadge(item.active),
    },
  ];
  if (canFinancial) return columns;
  return columns.filter((column) => !["monthly_salary", "employee_salary_history"].includes(column.key));
}

export default function Page() {
  const [canFinancial, setCanFinancial] = useState(false);

  useEffect(() => {
    adminFetch<any>("/api/admin/me")
      .then((data) => setCanFinancial(Boolean(data.admin?.can_edit_financial || data.admin?.canViewFinancialData)))
      .catch(() => setCanFinancial(false));
  }, []);

  const fields = useMemo(() => canFinancial ? baseFields : baseFields.filter((field) => !financialFieldNames.has(field.name)), [canFinancial]);
  const columns = useMemo(() => buildColumns(canFinancial), [canFinancial]);
  const omitFieldNamesOnSave = useMemo(() => canFinancial ? [] : [...financialFieldNames], [canFinancial]);

  return (
    <AdminShell>
      <SectionTitle
        title="Gestão de funcionários"
        description="Cadastro profissional por matrícula, PIN de 4 dígitos, filial, setor, escala, salário, dados de pagamento, importação em massa e exportação para RH."
      />
      <Card className="mb-4 overflow-hidden p-0">
        <div className="flex flex-col justify-between gap-4 bg-gradient-to-r from-brand-800 via-brand-700 to-brand-600 p-5 text-white lg:flex-row lg:items-center">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-sun-100">
              Funcionários
            </p>
            <h2 className="mt-1 text-2xl font-black">
              Importação, exportação filtrada e cadastro completo
            </h2>
            <p className="mt-1 max-w-3xl text-sm font-semibold text-emerald-50">
              Use os botões de exportação filtrada dentro da tabela para respeitar filial, busca, status, contrato e dia de pagamento.
            </p>
          </div>
          <div className="admin-action-row mobile-stack-actions">
            <Link
              className="btn-safe inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-sun-400 px-4 py-2.5 text-sm font-extrabold text-brand-950 shadow-[0_14px_30px_rgba(255,193,7,0.18)] transition hover:-translate-y-0.5 hover:bg-sun-300"
              href="/admin/funcionarios/importar"
            >
              <FileUp className="h-4 w-4" /> Importar
            </Link>
            <Button
              variant="ghost"
              onClick={() =>
                downloadAdminFile(
                  "/api/admin/employees/import/template",
                  "modelo-importacao-funcionarios.xlsx",
                )
              }
              className="border-white/20 bg-white/10 text-white hover:bg-white hover:text-brand-800"
            >
              <Download className="h-4 w-4" /> Modelo
            </Button>
          </div>
        </div>
      </Card>
      {!canFinancial ? (
        <Card className="mb-4 border-amber-200 bg-amber-50 text-amber-950">
          <p className="text-sm font-bold">Seu perfil não possui permissão financeira. Salário, diária, Pix, banco e dia de pagamento ficam ocultos e bloqueados no backend.</p>
        </Card>
      ) : null}
      <ResourceManager
        title="Cadastro individual"
        description="Edite dados pessoais, filial, setor, cargo, escala, salário, pagamento e PIN de 4 dígitos. Exportações nesta área respeitam os filtros ativos."
        endpoint="/api/admin/employees"
        collectionKey="employees"
        fields={fields}
        columns={columns}
        exportEndpoint="/api/admin/employees/export"
        exportFileBase="funcionarios-nexponto"
        omitFieldNamesOnSave={omitFieldNamesOnSave}
        serverPagination
        pageSize={25}
        filters={[
          {
            key: "branch_id",
            label: "Filial",
            allLabel: "Todas as unidades",
            optionsEndpoint: "/api/admin/branches?status=active",
            optionsKey: "branches",
            optionLabel: "name",
            optionValue: "id"
          },
          {
            key: "payment_day",
            label: "Dia de pagamento",
            allLabel: "Todos os dias",
            options: [5, 10, 15, 20, 25, 30].map((day) => ({ label: `Dia ${day}`, value: day }))
          },
          {
            key: "status",
            label: "Status",
            allLabel: "Todos",
            options: [{ label: "Ativo", value: "active" }, { label: "Inativo", value: "inactive" }]
          },
          {
            key: "employment_type",
            label: "Contrato",
            allLabel: "Todos",
            options: [{ label: "Mensalista", value: "mensalista" }, { label: "Quinzenal", value: "quinzenal" }, { label: "Diarista", value: "diarista" }]
          }
        ]}
        disableShell
        defaultValues={{
          employment_type: "mensalista",
          daily_rate_mode: "automatic",
          active: true,
          allow_overtime: true,
          expected_start_time: "08:00",
          expected_end_time: "17:00",
          expected_daily_minutes: 480,
          expected_lunch_minutes: 60,
          expected_lunch_start_time: "12:00",
          expected_lunch_end_time: "13:00",
          work_days: "1,2,3,4,5,6",
        }}
      />
    </AdminShell>
  );
}
