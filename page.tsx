"use client";

import { CheckCircle2, LocateFixed, MapPin, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { publicJson } from "@/lib/client/public-api";

type Result = { confirmed: boolean; distanceMeters: number; accuracyMeters: number; branch: { name: string; allowedRadiusMeters: number } };

export default function ValidateGpsPage() {
  const [token, setToken] = useState("");
  useEffect(() => setToken(new URLSearchParams(window.location.search).get("token") || ""), []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  async function validate() {
    setLoading(true);
    setError("");
    try {
      if (!token) throw new Error("Link de validação incompleto.");
      if (!navigator.geolocation) throw new Error("Este aparelho não disponibiliza localização.");
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 });
      });
      const payload = await publicJson<Result>("/api/public/gps/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy_meters: Math.round(position.coords.accuracy),
          device_info: navigator.userAgent,
        }),
      });
      setResult(payload);
      if (!payload.confirmed) setError("A validação não foi aprovada. Confirme se você está dentro da unidade e com o GPS em alta precisão.");
    } catch (cause) {
      const isGeolocationError = typeof cause === "object" && cause !== null && "code" in cause;
      setError(isGeolocationError
        ? "Não foi possível acessar o GPS. Autorize a localização nas configurações do navegador e tente novamente."
        : cause instanceof Error ? cause.message : "Não foi possível validar o GPS.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-white">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-md content-center gap-5">
        <BrandMark inverse />
        <section className="rounded-[2rem] bg-white p-5 text-slate-900 shadow-2xl sm:p-7">
          <div className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-700">
            <LocateFixed className="h-7 w-7" />
          </div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-brand-700">Validação presencial</p>
          <h1 className="mt-2 text-2xl font-black">Confirme o GPS da unidade</h1>
          <p className="mt-2 text-sm font-medium leading-6 text-slate-600">Faça este teste dentro da filial, com o GPS ativado e a precisão do aparelho no modo alto.</p>

          {result ? (
            <div className={`mt-5 rounded-2xl border p-4 ${result.confirmed ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
              <div className="flex items-start gap-3">
                {result.confirmed ? <CheckCircle2 className="h-6 w-6 text-emerald-600" /> : <ShieldAlert className="h-6 w-6 text-amber-600" />}
                <div>
                  <p className="font-black">{result.confirmed ? "GPS confirmado com sucesso" : "Validação não aprovada"}</p>
                  <p className="mt-1 text-sm text-slate-700">{result.branch.name} • distância {result.distanceMeters} m • precisão {result.accuracyMeters} m</p>
                </div>
              </div>
            </div>
          ) : null}
          {error ? <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">{error}</p> : null}
          <Button className="mt-5 w-full" size="lg" loading={loading} onClick={validate} disabled={!token || result?.confirmed}>
            <MapPin className="h-5 w-5" />
            {result?.confirmed ? "Validação concluída" : "Validar localização agora"}
          </Button>
          <p className="mt-4 text-center text-xs font-medium text-slate-500">O link é temporário e só pode ser usado uma vez.</p>
        </section>
      </div>
    </main>
  );
}
