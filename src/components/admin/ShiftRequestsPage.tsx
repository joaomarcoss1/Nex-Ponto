"use client";

import { ResourceManager } from "@/components/admin/ResourceManager";
import { Badge } from "@/components/ui/badge";

const branchOptions = {
  optionsEndpoint: "/api/admin/branches?status=active",
  optionsKey: "branches",
  optionLabel: "name",
};

const fields = [
  { name: "employee_id", label: "Funcionário", type: "select" as const, required: true, optionsEndpoint: "/api/admin/employees?status=active", optionsKey: "employees", optionLabel: "full_name" },
  { name: "branch_id", label: "Filial atual", type: "select" as const, required: true, ...branchOptions },
  { name: "request_date", label: "Início/vigência", type: "date" as const, required: true },
  { name: "end_date", label: "Fim da vigência", type: "date" as const },
  { name: "request_type", label: "Tipo", type: "select" as const, required: true, options: [
    { label: "Troca de turno", value: "troca_turno" },
    { label: "Folga", value: "folga" },
    { label: "Compensação no banco de horas", value: "compensacao" },
    { label: "Trabalho em outra filial", value: "outra_filial" },
  ] },
  { name: "target_branch_id", label: "Filial de destino", type: "select" as const, ...branchOptions },
  { name: "requested_start_time", label: "Nova entrada", type: "time" as const },
  { name: "requested_lunch_start_time", label: "Novo início do almoço", type: "time" as const },
  { name: "requested_lunch_end_time", label: "Novo fim do almoço", type: "time" as const },
  { name: "requested_end_time", label: "Nova saída", type: "time" as const },
  { name: "requested_minutes", label: "Minutos para o banco (+/-)", type: "number" as const },
  { name: "reason", label: "Motivo", type: "textarea" as const, required: true },
  { name: "admin_observation", label: "Parecer do gestor/RH", type: "textarea" as const },
  { name: "status", label: "Status", type: "select" as const, options: [
    { label: "Pendente", value: "pending" },
    { label: "Aprovado pelo gerente", value: "approved_manager" },
    { label: "Aprovado e aplicado pelo RH", value: "approved_hr" },
    { label: "Rejeitado", value: "rejected" },
    { label: "Cancelado", value: "canceled" },
  ] },
];

const columns = [
  { key: "employees", label: "Funcionário", render: (item: any) => item.employees?.full_name || "-" },
  { key: "branches", label: "Filial", render: (item: any) => item.branches?.name || "-" },
  { key: "request_date", label: "Vigência" },
  { key: "request_type", label: "Tipo" },
  { key: "status", label: "Status", render: (item: any) => <Badge tone={item.status === "approved_hr" ? "green" : item.status === "rejected" ? "red" : "yellow"}>{item.status}</Badge> },
  { key: "applied_entity_type", label: "Efeito aplicado", render: (item: any) => item.applied_entity_type || "Aguardando aprovação final" },
  { key: "reason", label: "Motivo" },
];

export function ShiftRequestsPage() {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <ResourceManager
      title="Solicitações e aprovações"
      description="A aprovação final do RH executa a operação correspondente: escala excepcional, folga, autorização de filial ou movimento no banco de horas."
      endpoint="/api/admin/shift-requests"
      collectionKey="requests"
      fields={fields}
      columns={columns}
      defaultValues={{ request_date: today, end_date: today, request_type: "troca_turno", status: "pending", requested_minutes: 0 }}
    />
  );
}
