"use client";

import { AdminShell } from "@/components/admin/AdminShell";
import {
  ResourceManager,
  activeBadge,
} from "@/components/admin/ResourceManager";

const employeeSelect = {
  type: "select" as const,
  optionsEndpoint: "/api/admin/employees?status=active",
  optionsKey: "employees",
  optionLabel: "full_name",
};

const branchSelect = {
  type: "select" as const,
  optionsEndpoint: "/api/admin/branches?status=active",
  optionsKey: "branches",
  optionLabel: "name",
};

const scheduleFields = [
  { name: "employee_id", label: "Funcionário", ...employeeSelect },
  { name: "branch_id", label: "Filial específica", ...branchSelect },
  { name: "title", label: "Nome da escala" },
  { name: "work_days", label: "Dias trabalhados (0=dom, 6=sáb)" },
  {
    name: "weekday",
    label: "Dia específico da semana",
    type: "number" as const,
  },
  { name: "specific_date", label: "Data específica", type: "date" as const },
  { name: "expected_start_time", label: "Entrada", type: "time" as const },
  { name: "expected_end_time", label: "Saída", type: "time" as const },
  {
    name: "expected_daily_minutes",
    label: "Carga diária (min)",
    type: "number" as const,
  },
  {
    name: "expected_lunch_minutes",
    label: "Almoço (min)",
    type: "number" as const,
  },
  { name: "expected_lunch_start_time", label: "Saída para intervalo", type: "time" as const },
  { name: "expected_lunch_end_time", label: "Retorno do intervalo", type: "time" as const },
  { name: "crosses_midnight", label: "Turno atravessa a meia-noite", type: "checkbox" as const },
  { name: "effective_from", label: "Vigente desde", type: "date" as const },
  { name: "effective_until", label: "Vigente até", type: "date" as const },
  { name: "priority", label: "Prioridade", type: "number" as const },
  { name: "notes", label: "Observações", type: "textarea" as const },
  { name: "active", label: "Escala ativa", type: "checkbox" as const },
];

const holidayFields = [
  { name: "branch_id", label: "Filial (vazio = todas)", ...branchSelect },
  { name: "holiday_date", label: "Data", type: "date" as const },
  { name: "title", label: "Título" },
  {
    name: "type",
    label: "Tipo",
    type: "select" as const,
    options: [
      { label: "Feriado", value: "holiday" },
      { label: "Folga", value: "day_off" },
      { label: "Sem expediente", value: "no_work" },
    ],
  },
  { name: "active", label: "Ativo", type: "checkbox" as const },
];

const authorizationFields = [
  { name: "employee_id", label: "Funcionário", ...employeeSelect },
  { name: "branch_id", label: "Filial autorizada", ...branchSelect },
  { name: "starts_on", label: "Início", type: "date" as const },
  { name: "ends_on", label: "Fim", type: "date" as const },
  { name: "reason", label: "Motivo", type: "textarea" as const },
  { name: "active", label: "Autorização ativa", type: "checkbox" as const },
];

export default function Page() {
  return (
    <AdminShell>
      <div className="grid gap-8">
        <ResourceManager
          disableShell
          title="Escalas e horários"
          description="Controle individual de dias trabalhados, entrada, saída e almoço."
          endpoint="/api/admin/work-schedules"
          collectionKey="schedules"
          fields={scheduleFields}
          columns={[
            {
              key: "employees",
              label: "Funcionário",
              render: (item: any) => item.employees?.full_name || "-",
            },
            { key: "title", label: "Escala" },
            {
              key: "work_days",
              label: "Dias",
              render: (item: any) => (item.work_days || []).join(","),
            },
            {
              key: "weekday",
              label: "Dia específico",
              render: (item: any) => item.weekday ?? "-",
            },
            {
              key: "specific_date",
              label: "Data",
              render: (item: any) => item.specific_date || "-",
            },
            { key: "expected_start_time", label: "Entrada" },
            { key: "expected_end_time", label: "Saída" },
            {
              key: "active",
              label: "Status",
              render: (item: any) => activeBadge(item.active),
            },
          ]}
          defaultValues={{
            active: true,
            expected_daily_minutes: 480,
            expected_lunch_minutes: 60,
            work_days: "1,2,3,4,5,6",
            priority: 10,
          }}
        />
        <ResourceManager
          disableShell
          title="Feriados, folgas e dias sem expediente"
          description="Dias cadastrados aqui não geram falta indevida na folha."
          endpoint="/api/admin/holidays"
          collectionKey="holidays"
          fields={holidayFields}
          columns={[
            { key: "holiday_date", label: "Data" },
            { key: "title", label: "Título" },
            { key: "type", label: "Tipo" },
            {
              key: "branches",
              label: "Filial",
              render: (item: any) => item.branches?.name || "Todas",
            },
            {
              key: "active",
              label: "Status",
              render: (item: any) => activeBadge(item.active),
            },
          ]}
          defaultValues={{ type: "holiday", active: true }}
        />
        <ResourceManager
          disableShell
          title="Autorização temporária de filial"
          description="Permite que um funcionário bata ponto em outra filial dentro do período configurado."
          endpoint="/api/admin/branch-authorizations"
          collectionKey="authorizations"
          fields={authorizationFields}
          columns={[
            {
              key: "employees",
              label: "Funcionário",
              render: (item: any) => item.employees?.full_name || "-",
            },
            {
              key: "branches",
              label: "Filial",
              render: (item: any) => item.branches?.name || "-",
            },
            { key: "starts_on", label: "Início" },
            { key: "ends_on", label: "Fim" },
            {
              key: "active",
              label: "Status",
              render: (item: any) => activeBadge(item.active),
            },
          ]}
          defaultValues={{ active: true }}
        />
      </div>
    </AdminShell>
  );
}
