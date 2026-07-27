"use client";

import { Check, ExternalLink, X } from "lucide-react";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { Field, Select, Textarea } from "@/components/ui/field";
import { adminFetch } from "@/lib/client/admin-api";

export function JustificationsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [filters, setFilters] = useState({ status: "pending", branchId: "" });
  const [observation, setObservation] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    adminFetch<any>("/api/admin/branches?status=active").then((data) => setBranches(data.branches || [])).catch(() => undefined);
  }, []);

  async function load() {
    const params = new URLSearchParams();
    if (filters.status) params.set("status", filters.status);
    if (filters.branchId) params.set("branchId", filters.branchId);
    try {
      const data = await adminFetch<any>(`/api/admin/justifications?${params.toString()}`);
      setItems(data.justifications || []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar justificativas.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function review(id: string, status: "approved" | "rejected") {
    try {
      await adminFetch("/api/admin/justifications", {
        method: "PATCH",
        body: JSON.stringify({ id, status, admin_observation: observation[id] || "" })
      });
      setMessage(status === "approved" ? "Justificativa aprovada." : "Justificativa rejeitada.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao revisar justificativa.");
    }
  }

  return (
    <AdminShell>
      <SectionTitle title="Justificativas" description="Aprovação ou rejeição de faltas com anexo seguro e efeito direto na folha." />
      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Field label="Status">
            <Select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
              <option value="">Todos</option>
              <option value="pending">Pendentes</option>
              <option value="approved">Aprovadas</option>
              <option value="rejected">Rejeitadas</option>
            </Select>
          </Field>
          <Field label="Filial">
            <Select value={filters.branchId} onChange={(event) => setFilters({ ...filters, branchId: event.target.value })}>
              <option value="">Todas</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="self-end">
            <Button onClick={load}>Aplicar filtros</Button>
          </div>
        </div>
      </Card>
      {message ? <p className="mb-3 rounded-lg bg-emerald-50 p-3 font-bold text-emerald-800">{message}</p> : null}
      {error ? <p className="mb-3 rounded-lg bg-red-50 p-3 font-bold text-red-800">{error}</p> : null}
      <div className="grid gap-3">
        {items.map((item) => (
          <Card key={item.id}>
            <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-black">{item.employees?.full_name}</h2>
                  <Badge tone={item.status === "approved" ? "green" : item.status === "rejected" ? "red" : "yellow"}>{item.status}</Badge>
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  {item.branches?.name} • Falta em {item.absence_date}
                </p>
                <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm font-semibold text-slate-700">{item.justification_text}</p>
                {item.signed_attachment_url ? (
                  <a
                    href={item.signed_attachment_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-brand-700"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Abrir anexo
                  </a>
                ) : null}
              </div>
              <div className="grid gap-3">
                <Field label="Observação da administração">
                  <Textarea value={observation[item.id] || item.admin_observation || ""} onChange={(event) => setObservation({ ...observation, [item.id]: event.target.value })} />
                </Field>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Button variant="secondary" onClick={() => review(item.id, "approved")}>
                    <Check className="h-4 w-4" />
                    Aprovar
                  </Button>
                  <Button variant="danger" onClick={() => review(item.id, "rejected")}>
                    <X className="h-4 w-4" />
                    Rejeitar
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        ))}
        {!items.length ? <Card className="text-center text-slate-500">Nenhuma justificativa encontrada.</Card> : null}
      </div>
    </AdminShell>
  );
}
