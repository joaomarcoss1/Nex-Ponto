"use client";
import { publicFetch } from "@/lib/client/public-api";

import { CheckCircle2, Clock3, LocateFixed, MapPin, Navigation, ShieldAlert, Sparkles, ChevronDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { EmployeeSearch } from "@/components/public/EmployeeSearch";
import { PinInput } from "@/components/public/PinInput";
import { PublicShell } from "@/components/public/PublicShell";
import { actionLabels, statusLabels } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import type { PublicEmployee, TimeAction, TimeEntryStatus } from "@/types/domain";

type BranchOption = { id: string; name: string; type: string };
type GeoState = "idle" | "searching" | "inside" | "outside" | "denied";

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Este aparelho não oferece geolocalização pelo navegador."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0
    });
  });
}

function LocationChip({ state, distance }: { state: GeoState; distance?: number }) {
  const label =
    state === "searching"
      ? "Buscando localização"
      : state === "inside"
        ? `Dentro do raio${distance ? ` • ${distance}m` : ""}`
        : state === "outside"
          ? `Fora do raio${distance ? ` • ${distance}m` : ""}`
          : state === "denied"
            ? "Permissão de GPS negada"
            : "GPS pronto";
  const tone = state === "inside" ? "green" : state === "outside" || state === "denied" ? "red" : state === "searching" ? "yellow" : "blue";
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700">
      <Navigation className="h-4 w-4 text-brand-700" />
      <Badge tone={tone as any}>{label}</Badge>
    </div>
  );
}

function DayTimeline({ entries }: { entries: Array<{ id: string; action: TimeAction; entry_timestamp: string; status: TimeEntryStatus }> }) {
  const ordered = [...entries].sort((a, b) => new Date(a.entry_timestamp).getTime() - new Date(b.entry_timestamp).getTime());
  return (
    <div className="grid gap-3">
      <h2 className="font-black text-slate-950">Linha do tempo da jornada</h2>
      <div className="relative grid gap-2 before:absolute before:bottom-5 before:left-[18px] before:top-5 before:w-px before:bg-slate-200">
        {ordered.map((entry, index) => (
          <div key={entry.id} className="relative flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
            <span className="z-10 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-600 text-white shadow-sm">
              <CheckCircle2 className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-slate-900">{actionLabels[entry.action]}</p>
              <p className="text-xs font-semibold text-slate-500">{formatDateTime(entry.entry_timestamp)} • evento {index + 1}</p>
            </div>
            <Badge tone={entry.status === "valid" ? "green" : entry.status === "pending_review" ? "yellow" : "red"}>
              {statusLabels[entry.status] || entry.status}
            </Badge>
          </div>
        ))}
        {!ordered.length ? <p className="rounded-2xl bg-slate-50 p-4 text-center text-sm text-slate-500">Nenhuma marcação nesta jornada.</p> : null}
      </div>
    </div>
  );
}

export function ClockPage() {
  const [employee, setEmployee] = useState<PublicEmployee | null>(null);
  const [pin, setPin] = useState("");
  const [branchId, setBranchId] = useState("");
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [state, setState] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [branchError, setBranchError] = useState("");
  const [pendingAction, setPendingAction] = useState<TimeAction | null>(null);
  const [pendingAttemptId, setPendingAttemptId] = useState<string | null>(null);
  const [pendingIdempotencyKey, setPendingIdempotencyKey] = useState<string | null>(null);
  const [justification, setJustification] = useState("");
  const [geoState, setGeoState] = useState<GeoState>("idle");
  const [lastConfirmation, setLastConfirmation] = useState<any>(null);
  const [showOtherActions, setShowOtherActions] = useState(false);
  const [qrToken, setQrToken] = useState("");

  useEffect(() => {
    publicFetch("/api/public/branches")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Não foi possível carregar filiais.");
        setBranches(data.branches || []);
        setBranchError("");
      })
      .catch((err) => setBranchError(err instanceof Error ? err.message : "Não foi possível carregar filiais."));
  }, []);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("qr") || "";
    if (!token) return;
    setQrToken(token);
    publicFetch(`/api/public/qr?token=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "QR inválido.");
        setBranchId(data.branch.id);
        setMessage(`QR seguro validado para ${data.branch.name}.`);
      })
      .catch((err: Error) => {
        setQrToken("");
        setError(err.message);
      });
  }, []);

  useEffect(() => {
    setState(null);
    setMessage("");
    setError("");
    setPendingAction(null);
    setPendingAttemptId(null);
    setPendingIdempotencyKey(null);
    setShowOtherActions(false);
    if (!qrToken) setBranchId(employee?.branch_id || "");
  }, [employee, qrToken]);

  async function loadState() {
    if (!employee || pin.length !== 4) {
      setError("Selecione seu nome e informe o PIN com 4 dígitos.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await publicFetch("/api/public/clock/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: employee.id, pin })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível validar o PIN.");
      setState(data);
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar estado.");
    } finally {
      setLoading(false);
    }
  }

  async function register(action: TimeAction, forcedJustification?: string) {
    if (!employee) return;
    setLoading(true);
    setError("");
    const continuingAttempt = Boolean(forcedJustification && pendingAttemptId);
    if (!continuingAttempt) {
      setGeoState("searching");
      setMessage("Capturando GPS com alta precisão...");
    }
    try {
      const position = continuingAttempt ? null : await getPosition();
      if (!continuingAttempt) setMessage("Validando jornada, filial e raio...");
      const idempotencyKey = pendingIdempotencyKey || `${employee.id}:${action}:${crypto.randomUUID()}`;
      const response = await publicFetch("/api/public/clock/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          pin,
          branchId,
          action,
          latitude: position?.coords.latitude,
          longitude: position?.coords.longitude,
          justificationText: forcedJustification,
          deviceInfo: navigator.userAgent,
          gpsAccuracyMeters: position ? Math.round(position.coords.accuracy || 0) : undefined,
          qrToken,
          attemptId: continuingAttempt ? pendingAttemptId : undefined,
          idempotencyKey,
          clientTimestamp: new Date().toISOString(),
          offlineStatus: "online"
        })
      });
      const data = await response.json();
      if (response.status === 202 && data.requiresJustification) {
        setPendingAction(action);
        setPendingAttemptId(data.attemptId || null);
        setPendingIdempotencyKey(idempotencyKey);
        setMessage(data.message || "Esta marcação precisa de justificativa.");
        return;
      }
      if (!response.ok) throw new Error(data.error || "Não foi possível registrar o ponto.");
      setGeoState(data.insideAllowedRadius ? "inside" : "outside");
      setLastConfirmation({
        action,
        successful: true,
        confirmation: data.confirmation,
        distanceMeters: data.distanceMeters,
        accuracyMeters: data.accuracyMeters,
        radiusMeters: data.radiusMeters,
        status: data.status,
        branchName: branches.find((branch) => branch.id === branchId)?.name || employee.branch_name || "Filial",
        timestamp: data.entry?.entry_timestamp || new Date().toISOString()
      });
      setMessage(`${data.confirmation} Distância: ${data.distanceMeters}m. Precisão GPS: ${data.accuracyMeters || "não informada"}m.`);
      setPendingAction(null);
      setPendingAttemptId(null);
      setPendingIdempotencyKey(null);
      setJustification("");
      await loadState();
    } catch (err) {
      setGeoState(err instanceof Error && err.message.toLowerCase().includes("denied") ? "denied" : "idle");
      setError(err instanceof Error ? err.message : "Erro ao registrar ponto.");
      setMessage("");
    } finally {
      setLoading(false);
    }
  }

  async function testGps() {
    if (!branchId) {
      setError("Selecione a filial para testar o GPS.");
      return;
    }
    setLoading(true);
    setError("");
    setMessage("Testando GPS da filial selecionada...");
    setGeoState("searching");
    try {
      const position = await getPosition();
      const response = await publicFetch("/api/public/gps/diagnostic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          gpsAccuracyMeters: Math.round(position.coords.accuracy || 0),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível testar o GPS.");
      setGeoState((data.insideAllowedRadius || data.inside_radius) ? "inside" : "outside");
      setLastConfirmation({
        action: "gps_test",
        successful: Boolean(data.can_clock_in),
        confirmation: data.message,
        distanceMeters: data.distanceMeters ?? data.calculated_distance_meters,
        accuracyMeters: data.current?.gpsAccuracyMeters ?? data.gps_accuracy,
        radiusMeters: data.radiusMeters ?? data.allowed_radius_meters,
        status: data.status,
        branchName: data.branch?.name || selectedBranch?.name || "Filial",
        timestamp: new Date().toISOString(),
      });
      setMessage(data.message || (data.can_clock_in ? "GPS confirmado." : "GPS ainda não está apto para ponto."));
    } catch (err) {
      setGeoState(err instanceof Error && err.message.toLowerCase().includes("denied") ? "denied" : "idle");
      setError(err instanceof Error ? err.message : "Erro ao testar GPS.");
      setMessage("");
    } finally {
      setLoading(false);
    }
  }



  const actions = Object.keys(actionLabels) as TimeAction[];
  const allowed = state?.next?.allowed || [];
  const nextLabel = state?.nextLabel || "Valide seu PIN";
  const selectedBranch = useMemo(() => branches.find((branch) => branch.id === branchId), [branches, branchId]);
  const recommendedAction = (state?.next?.recommended || allowed[0]) as TimeAction | undefined;
  const secondaryActions = actions.filter((action) => action !== recommendedAction);

  return (
    <PublicShell eyebrow="Ponto mobile" title="Registro de Ponto" subtitle="Informe seu nome e PIN para registrar sua jornada.">
      <div className="grid gap-4">
        {qrToken ? (
          <p className="flex items-center gap-2 rounded-2xl border border-brand-200 bg-brand-50 p-3 text-sm font-bold text-brand-900">
            <ShieldAlert className="h-4 w-4" /> QR físico da filial validado
          </p>
        ) : null}
        <EmployeeSearch selected={employee} onSelect={setEmployee} branchId={branchId} />
        <PinInput value={pin} onChange={setPin} disabled={loading} />

        <Field label="Filial de validação" hint="Use outra filial somente com autorização temporária do admin.">
          <Select value={branchId} onChange={(event) => setBranchId(event.target.value)} className="rounded-2xl">
            <option value="">Selecione</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </Select>
        </Field>
        {branchError ? <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">{branchError}</p> : null}

        <LocationChip state={geoState} distance={lastConfirmation?.distanceMeters} />
        <Button type="button" variant="ghost" onClick={testGps} disabled={loading || !branchId} loading={loading && geoState === "searching"} className="w-full rounded-2xl border border-brand-100 bg-white text-brand-800 hover:bg-brand-50">
          <Navigation className="h-4 w-4" />
          Testar GPS da filial
        </Button>
        {lastConfirmation?.accuracyMeters ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-3 text-xs font-bold text-slate-600">Precisão do GPS: {lastConfirmation.accuracyMeters}m • Raio da unidade: {lastConfirmation.radiusMeters || 900}m</p>
        ) : null}

        <Button type="button" size="lg" onClick={loadState} disabled={loading || !employee || pin.length !== 4} loading={loading && !state} className="w-full rounded-2xl">
          <Sparkles className="h-5 w-5" />
          Continuar
        </Button>

        {state ? (
          <section className="grid gap-4 rounded-[1.4rem] border border-brand-100 bg-gradient-to-br from-brand-50 to-white p-4 shadow-[0_18px_50px_rgba(18,104,243,0.09)] sm:rounded-3xl">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-bold text-brand-700">Próximo ponto recomendado</p>
                <h2 className="text-2xl font-black text-brand-900">{nextLabel}</h2>
                <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-brand-700">
                  <MapPin className="h-3.5 w-3.5" />
                  {selectedBranch?.name || state.employee?.branch_name || "Filial selecionada"}
                </p>
              </div>
              <Badge tone="green">{state.today}</Badge>
            </div>
            {recommendedAction ? (
              <Button
                type="button"
                size="lg"
                variant="secondary"
                disabled={loading || (!allowed.includes(recommendedAction) && state.next?.recommended !== recommendedAction)}
                loading={loading}
                onClick={() => register(recommendedAction)}
                className="sticky bottom-24 z-10 w-full rounded-2xl shadow-[0_18px_44px_rgba(244,197,66,0.25)] sm:static"
              >
                <LocateFixed className="h-5 w-5" />
                Registrar agora: {actionLabels[recommendedAction]}
              </Button>
            ) : null}
            <button type="button" onClick={() => setShowOtherActions((value) => !value)} className="flex items-center justify-center gap-2 rounded-2xl border border-brand-100 bg-white px-4 py-3 text-sm font-black text-brand-800">
              Outras opções de ponto
              <ChevronDown className={`h-4 w-4 transition ${showOtherActions ? "rotate-180" : ""}`} />
            </button>
            {showOtherActions ? (
              <div className="grid gap-3">
                {secondaryActions.map((action) => (
                  <Button
                    key={action}
                    type="button"
                    size="lg"
                    variant="ghost"
                    disabled={loading || !allowed.includes(action)}
                    loading={loading && pendingAction === action}
                    onClick={() => register(action)}
                    className="w-full rounded-2xl shadow-none"
                  >
                    <LocateFixed className="h-5 w-5" />
                    {actionLabels[action]}
                  </Button>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {pendingAction ? (
          <section className="rounded-3xl border-2 border-amber-300 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-1 h-6 w-6 text-amber-700" />
              <div className="grid flex-1 gap-3">
                <div>
                  <h2 className="font-black text-amber-950">Justificativa obrigatória</h2>
                  <p className="text-sm text-amber-900">{message}</p>
                </div>
                <Textarea value={justification} onChange={(event) => setJustification(event.target.value)} placeholder="Explique o motivo" />
                <Button type="button" disabled={loading || justification.trim().length < 8} onClick={() => register(pendingAction, justification)}>
                  Enviar justificativa e registrar
                </Button>
              </div>
            </div>
          </section>
        ) : null}

        {state?.entries?.length ? <DayTimeline entries={state.entries} /> : null}
        {message && !pendingAction ? <p className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-900">{message}</p> : null}
        {error ? <p className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">{error}</p> : null}
      </div>

      {lastConfirmation ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-[28px] bg-white p-5 text-center shadow-[0_32px_100px_rgba(0,0,0,0.28)]">
            <div className={`mx-auto grid h-20 w-20 place-items-center rounded-full ${
              lastConfirmation.successful === false ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
            }`}>
              {lastConfirmation.successful === false ? <ShieldAlert className="h-11 w-11" /> : <CheckCircle2 className="h-11 w-11" />}
            </div>
            <h2 className="mt-4 text-2xl font-black text-slate-950">{lastConfirmation.confirmation}</h2>
            <div className="mt-4 grid gap-2 rounded-2xl bg-slate-50 p-3 text-left text-sm font-semibold text-slate-700">
              <p>Ação: {lastConfirmation.action === "gps_test" ? "Diagnóstico de GPS (sem registrar ponto)" : actionLabels[lastConfirmation.action as TimeAction]}</p>
              <p>Horário: {formatDateTime(lastConfirmation.timestamp)}</p>
              <p>Filial: {lastConfirmation.branchName}</p>
              <p>Distância: {lastConfirmation.distanceMeters}m</p>
              <p>Precisão GPS: {lastConfirmation.accuracyMeters || "-"}m</p>
              <p>Raio validado: {lastConfirmation.radiusMeters || 900}m</p>
              <p>Status: {lastConfirmation.action === "gps_test"
                ? (lastConfirmation.successful ? "Apto para registrar ponto" : "Não apto para registrar ponto")
                : (statusLabels[lastConfirmation.status as TimeEntryStatus] || lastConfirmation.status)}</p>
            </div>
            <Button className="mt-4 w-full rounded-2xl" onClick={() => setLastConfirmation(null)}>
              Concluir
            </Button>
          </div>
        </div>
      ) : null}
    </PublicShell>
  );
}
