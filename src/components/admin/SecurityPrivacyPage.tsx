"use client";

import { useEffect, useState } from "react";
import { Laptop2, RefreshCw, Scale, ShieldCheck } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { SectionTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getBrowserAdminSession } from "@/lib/client/supabase";
import { apiErrorFromPayload } from "@/lib/client/api-error";

type Device = {
  id: string;
  display_name: string;
  status: string;
  trust_level: string;
  browser?: string;
  last_used_at?: string;
};
type PrivacyRequest = {
  id: string;
  request_type: string;
  status: string;
  requester_email?: string;
  created_at: string;
  due_at?: string;
};

async function adminJson(path: string, init?: RequestInit) {
  const { data } = await getBrowserAdminSession();
  if (!data.session) throw new Error("Sessão administrativa expirada.");
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.session.access_token}`,
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  const payload = await response.json();
  if (!response.ok) throw apiErrorFromPayload(payload, response.status, "Falha na operação.");
  return payload;
}

export function SecurityPrivacyPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [requests, setRequests] = useState<PrivacyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [devicePayload, privacyPayload] = await Promise.all([
        adminJson("/api/admin/devices"),
        adminJson("/api/admin/privacy-requests"),
      ]);
      setDevices(devicePayload.devices || []);
      setRequests(privacyPayload.requests || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erro ao carregar segurança.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function changeDevice(id: string, status: "active" | "revoked" | "blocked") {
    const reason = window.prompt("Motivo auditável da decisão (mínimo 10 caracteres):") || "";
    if (reason.trim().length < 10) return;
    await adminJson("/api/admin/devices", {
      method: "PATCH",
      body: JSON.stringify({ id, status, reason }),
    });
    await load();
  }

  return (
    <AdminShell>
      <SectionTitle
        title="Segurança e privacidade"
        description="Aprovação de dispositivos, rastreabilidade de risco e fila operacional LGPD."
        actions={<Button variant="ghost" loading={loading} onClick={load}><RefreshCw className="h-4 w-4" /> Atualizar</Button>}
      />
      {error ? <p className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">{error}</p> : null}
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <div className="mb-4 flex items-center gap-3">
            <Laptop2 className="h-6 w-6 text-brand-700" />
            <div><h2 className="font-black text-slate-950">Dispositivos de ponto</h2><p className="text-sm text-slate-600">Política monitorada por padrão; modo obrigatório pode ser ativado por tenant.</p></div>
          </div>
          <div className="grid gap-3">
            {devices.map((device) => (
              <article key={device.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div><p className="font-black text-slate-900">{device.display_name}</p><p className="text-xs text-slate-500">{device.browser || "Navegador não informado"}</p></div>
                  <Badge tone={device.status === "active" ? "green" : device.status === "pending" ? "yellow" : "red"}>{device.status}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {device.status !== "active" ? <Button size="sm" onClick={() => changeDevice(device.id, "active")}><ShieldCheck className="h-4 w-4" /> Autorizar</Button> : null}
                  <Button size="sm" variant="ghost" onClick={() => changeDevice(device.id, "revoked")}>Revogar</Button>
                  <Button size="sm" variant="danger" onClick={() => changeDevice(device.id, "blocked")}>Bloquear</Button>
                </div>
              </article>
            ))}
            {!devices.length && !loading ? <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">Nenhum dispositivo identificado.</p> : null}
          </div>
        </Card>
        <Card>
          <div className="mb-4 flex items-center gap-3">
            <Scale className="h-6 w-6 text-brand-700" />
            <div><h2 className="font-black text-slate-950">Solicitações LGPD</h2><p className="text-sm text-slate-600">Fila, prazo e decisão de retenção documentados.</p></div>
          </div>
          <div className="grid gap-3">
            {requests.map((item) => (
              <article key={item.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div><p className="font-black text-slate-900">{item.request_type.replaceAll("_", " ")}</p><p className="text-xs text-slate-500">{item.requester_email || "Titular vinculado ao cadastro"}</p></div>
                  <Badge tone={item.status === "completed" ? "green" : "yellow"}>{item.status}</Badge>
                </div>
                <p className="mt-2 text-xs font-semibold text-slate-500">
                  Recebida em {new Date(item.created_at).toLocaleDateString("pt-BR")}
                  {item.due_at ? ` • prazo ${new Date(item.due_at).toLocaleDateString("pt-BR")}` : ""}
                </p>
              </article>
            ))}
            {!requests.length && !loading ? <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">Nenhuma solicitação aberta.</p> : null}
          </div>
        </Card>
      </div>
    </AdminShell>
  );
}
