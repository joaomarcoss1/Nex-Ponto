"use client";

import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { adminFetch } from "@/lib/client/admin-api";
import { formatDateTime } from "@/lib/format";

export function AuditPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [filters, setFilters] = useState({ entity: "", q: "" });
  const [error, setError] = useState("");

  async function load() {
    const params = new URLSearchParams();
    if (filters.entity) params.set("entity", filters.entity);
    if (filters.q) params.set("q", filters.q);
    try {
      const data = await adminFetch<any>(`/api/admin/audit?${params.toString()}`);
      setLogs(data.logs || []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar auditoria.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AdminShell>
      <SectionTitle title="Auditoria" description="Logs de alterações importantes, ajustes manuais, permissões e fechamento de folha." />
      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <Field label="Entidade">
            <Select value={filters.entity} onChange={(event) => setFilters({ ...filters, entity: event.target.value })}>
              <option value="">Todas</option>
              <option value="employees">Funcionários</option>
              <option value="branches">Filiais</option>
              <option value="time_entries">Pontos</option>
              <option value="absence_justifications">Justificativas</option>
              <option value="payroll_periods">Folha</option>
              <option value="admin_users">Admins</option>
              <option value="system_settings">Configurações</option>
            </Select>
          </Field>
          <Field label="Busca">
            <Input value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} placeholder="ação ou e-mail" />
          </Field>
          <Button className="self-end" onClick={load}>
            <Search className="h-4 w-4" />
            Filtrar
          </Button>
        </div>
      </Card>
      {error ? <p className="mb-3 rounded-lg bg-red-50 p-3 font-bold text-red-800">{error}</p> : null}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <th className="p-3">Data</th>
                <th className="p-3">Usuário</th>
                <th className="p-3">Ação</th>
                <th className="p-3">Entidade</th>
                <th className="p-3">Registro</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-slate-100">
                  <td className="p-3">{formatDateTime(log.created_at)}</td>
                  <td className="p-3">{log.user_email || "sistema"}</td>
                  <td className="p-3 font-bold">{log.action}</td>
                  <td className="p-3">{log.entity}</td>
                  <td className="p-3 text-xs text-slate-500">{log.entity_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </AdminShell>
  );
}
