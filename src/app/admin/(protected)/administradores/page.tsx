"use client";

import {
  ResourceManager,
  activeBadge,
  type ResourceField,
  type TableColumn,
} from "@/components/admin/ResourceManager";

const fields: ResourceField[] = [
  { name: "full_name", label: "Nome completo", required: true },
  { name: "email", label: "E-mail", type: "text", required: true },
  {
    name: "password",
    label: "Senha inicial",
    type: "password",
    hiddenOnEdit: true,
    placeholder: "Mínimo de 10 caracteres, com letras e números",
  },
  {
    name: "role",
    label: "Permissão",
    type: "select",
    required: true,
    options: [
      { label: "Admin master", value: "master_admin" },
      { label: "Admin geral", value: "admin_geral" },
      { label: "RH/Financeiro", value: "rh_financeiro" },
      { label: "Gerente de filial", value: "gerente_filial" },
      { label: "Admin legado", value: "admin" },
    ],
  },
  {
    name: "branch_id",
    label: "Filial principal",
    type: "select",
    optionsEndpoint: "/api/admin/options/branches?status=all&screen=admins-v018",
    optionsKey: "branches",
    optionLabel: "name",
    placeholder: "Deixe vazio para acesso geral, conforme a permissão",
  },
  {
    name: "allowed_branch_ids",
    label: "Filiais permitidas adicionais",
    type: "multiselect",
    optionsEndpoint: "/api/admin/options/branches?status=all&screen=admins-v019",
    optionsKey: "branches",
    optionLabel: "name",
  },
  {
    name: "can_view_financial_data",
    label: "Pode ver dados financeiros",
    type: "checkbox",
  },
  { name: "active", label: "Ativo", type: "checkbox" },
];

const columns: TableColumn[] = [
  { key: "full_name", label: "Nome" },
  { key: "email", label: "E-mail" },
  { key: "role", label: "Permissão" },
  {
    key: "branches",
    label: "Filial",
    render: (item: any) => item.branches?.name || "Todas/geral",
  },
  {
    key: "allowed_branch_ids",
    label: "Acesso regional",
    render: (item: any) => Array.isArray(item.allowed_branch_ids) && item.allowed_branch_ids.length ? `${item.allowed_branch_ids.length} filial(is)` : "Somente principal/geral",
  },
  {
    key: "auth_user_id",
    label: "Login",
    render: (item: any) => item.auth_user_id ? "Vinculado" : "Pendente",
  },
  {
    key: "can_view_financial_data",
    label: "Financeiro",
    render: (item: any) => (item.can_view_financial_data ? "Sim" : "Não"),
  },
  {
    key: "active",
    label: "Status",
    render: (item: any) => activeBadge(item.active),
  },
];

const defaults = {
  role: "admin_geral",
  branch_id: "",
  allowed_branch_ids: [],
  active: true,
  can_view_financial_data: false,
};

export default function Page() {
  return (
    <ResourceManager
      title="Gestão de administradores"
      description="Crie um login novo com nome, e-mail e senha inicial ou vincule um usuário já existente no Supabase Auth usando o mesmo e-mail. Gerente de filial precisa ter uma filial selecionada."
      endpoint="/api/admin/admins"
      collectionKey="admins"
      fields={fields}
      columns={columns}
      serverPagination
      pageSize={25}
      defaultValues={defaults}
    />
  );
}
