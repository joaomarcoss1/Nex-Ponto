"use client";

import { Crosshair, ExternalLink, LocateFixed, MapPin, Navigation, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

declare global {
  interface Window {
    google?: any;
    __nexPontoGoogleMapsLoading?: boolean;
  }
}

type MapValue = {
  name?: string;
  address?: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  allowed_radius_meters?: number | string | null;
  google_maps_url?: string | null;
};

function toNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function mapsSearchUrl(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address || "NexPonto")}`;
}

export function BranchMapEditor({ value, onChange }: { value: MapValue; onChange: (patch: Partial<MapValue>) => void }) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const circleRef = useRef<any>(null);
  const [search, setSearch] = useState(value.address || "");
  const [message, setMessage] = useState("");
  const [mapReady, setMapReady] = useState(false);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  const latitude = toNumber(value.latitude, -4.455);
  const longitude = toNumber(value.longitude, -43.885);
  const radius = Math.max(1, Math.round(toNumber(value.allowed_radius_meters, 900)));

  useEffect(() => {
    if (!apiKey || typeof window === "undefined") return;
    if (window.google?.maps) {
      setMapReady(true);
      return;
    }
    if (window.__nexPontoGoogleMapsLoading) return;
    window.__nexPontoGoogleMapsLoading = true;
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => setMapReady(true);
    script.onerror = () => setMessage("Não foi possível carregar o Google Maps. Use latitude/longitude manualmente.");
    document.head.appendChild(script);
  }, [apiKey]);

  useEffect(() => {
    if (!apiKey || !mapReady || !mapRef.current || !window.google?.maps) return;
    const center = { lat: latitude, lng: longitude };
    const maps = window.google.maps;
    if (!mapInstance.current) {
      mapInstance.current = new maps.Map(mapRef.current, {
        center,
        zoom: 16,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true
      });
      markerRef.current = new maps.Marker({ position: center, map: mapInstance.current, draggable: true, title: value.name || "Filial" });
      circleRef.current = new maps.Circle({
        map: mapInstance.current,
        center,
        radius,
        fillColor: "#1268F3",
        fillOpacity: 0.14,
        strokeColor: "#F4B51C",
        strokeWeight: 2
      });
      markerRef.current.addListener("dragend", () => {
        const position = markerRef.current.getPosition();
        const lat = Number(position.lat().toFixed(7));
        const lng = Number(position.lng().toFixed(7));
        circleRef.current.setCenter({ lat, lng });
        onChange({ latitude: lat, longitude: lng, google_maps_url: `https://www.google.com/maps?q=${lat},${lng}` });
        setMessage("Ponto do mapa atualizado pelo marcador arrastável.");
      });
      mapInstance.current.addListener("click", (event: any) => {
        const lat = Number(event.latLng.lat().toFixed(7));
        const lng = Number(event.latLng.lng().toFixed(7));
        markerRef.current.setPosition({ lat, lng });
        circleRef.current.setCenter({ lat, lng });
        onChange({ latitude: lat, longitude: lng, google_maps_url: `https://www.google.com/maps?q=${lat},${lng}` });
        setMessage("Ponto selecionado no mapa.");
      });
    } else {
      mapInstance.current.setCenter(center);
      markerRef.current?.setPosition(center);
      circleRef.current?.setCenter(center);
      circleRef.current?.setRadius(radius);
    }
  }, [apiKey, mapReady, latitude, longitude, radius, onChange, value.name]);

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setMessage("Este navegador não oferece geolocalização.");
      return;
    }
    setMessage("Capturando localização atual...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = Number(position.coords.latitude.toFixed(7));
        const lng = Number(position.coords.longitude.toFixed(7));
        onChange({ latitude: lat, longitude: lng, google_maps_url: `https://www.google.com/maps?q=${lat},${lng}` });
        setMessage(`Localização aplicada. Precisão aproximada: ${Math.round(position.coords.accuracy || 0)}m.`);
      },
      () => setMessage("Não foi possível capturar sua localização. Verifique a permissão de GPS."),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  function searchAddress() {
    if (!apiKey || !window.google?.maps) {
      window.open(mapsSearchUrl(search || value.address || ""), "_blank", "noopener,noreferrer");
      setMessage("Google Maps aberto em nova aba. Copie a latitude/longitude ou use o marcador com chave de API configurada.");
      return;
    }
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ address: search }, (results: any[], status: string) => {
      if (status !== "OK" || !results?.[0]) {
        setMessage("Endereço não encontrado no Google Maps.");
        return;
      }
      const location = results[0].geometry.location;
      const lat = Number(location.lat().toFixed(7));
      const lng = Number(location.lng().toFixed(7));
      onChange({ latitude: lat, longitude: lng, address: results[0].formatted_address, google_maps_url: `https://www.google.com/maps?q=${lat},${lng}` });
      setSearch(results[0].formatted_address);
      setMessage("Endereço localizado e marcador atualizado.");
    });
  }

  return (
    <div className="grid gap-4 rounded-3xl border border-brand-100 bg-gradient-to-br from-brand-50 to-white p-4">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-brand-700">Geolocalização da unidade</p>
          <h3 className="text-lg font-black text-slate-950">Marque o ponto central da sede ou filial</h3>
          <p className="text-sm font-semibold text-slate-600">O raio de {radius}m será calculado a partir deste marcador.</p>
        </div>
        <a
          href={value.google_maps_url || `https://www.google.com/maps?q=${latitude},${longitude}`}
          target="_blank"
          rel="noreferrer"
          className="btn-safe inline-flex min-w-0 max-w-full items-center justify-center gap-2 rounded-2xl border border-brand-200 bg-white px-3 py-2 text-center text-xs font-black leading-tight text-brand-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-brand-50"
        >
          <ExternalLink className="h-4 w-4 shrink-0" /> Abrir no Google Maps
        </a>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
        <Field label="Buscar endereço no mapa">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-slate-400" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-10" placeholder="Digite rua, bairro, cidade ou nome da unidade" />
          </div>
        </Field>
        <div className="grid items-end gap-2 sm:grid-cols-2 lg:flex">
          <Button type="button" variant="secondary" onClick={searchAddress}>
            <MapPin className="h-4 w-4" /> Buscar
          </Button>
          <Button type="button" variant="ghost" onClick={useCurrentLocation}>
            <LocateFixed className="h-4 w-4" /> Usar minha localização
          </Button>
        </div>
      </div>

      {apiKey ? <div ref={mapRef} className="min-h-[360px] overflow-hidden rounded-[28px] border border-brand-200 bg-slate-100 shadow-inner" /> : (
        <div className="grid min-h-[260px] place-items-center rounded-[28px] border border-dashed border-brand-200 bg-white p-6 text-center shadow-inner">
          <div className="max-w-md">
            <MapPin className="mx-auto h-10 w-10 text-brand-600" />
            <h4 className="mt-3 font-black text-slate-950">Mapa interativo indisponível</h4>
            <p className="mt-2 text-sm font-semibold text-slate-600">Configure a chave do Google Maps para usar o marcador. Latitude, longitude, GPS atual e abertura externa continuam disponíveis.</p>
            <a href={value.google_maps_url || `https://www.google.com/maps?q=${latitude},${longitude}`} target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-11 items-center justify-center rounded-2xl bg-brand-600 px-4 text-sm font-black text-white">Abrir Google Maps</a>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Field label="Latitude">
          <Input type="number" step="0.0000001" value={value.latitude ?? ""} onChange={(event) => onChange({ latitude: event.target.value })} />
        </Field>
        <Field label="Longitude">
          <Input type="number" step="0.0000001" value={value.longitude ?? ""} onChange={(event) => onChange({ longitude: event.target.value })} />
        </Field>
        <Field label="Raio permitido (m)">
          <Input type="number" min={1} value={value.allowed_radius_meters ?? 900} onChange={(event) => onChange({ allowed_radius_meters: event.target.value })} />
        </Field>
      </div>

      <div className="grid gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-950">
        <p className="flex items-start gap-2"><Crosshair className="mt-0.5 h-4 w-4 shrink-0" /> Raio padrão amplo: 900m. Confirme se esta é a regra desejada para a unidade.</p>
        <p className="flex items-start gap-2"><Navigation className="mt-0.5 h-4 w-4 shrink-0" /> Ponto central: {latitude.toFixed(7)}, {longitude.toFixed(7)}</p>
        {message ? <p>{message}</p> : null}
        {!apiKey ? <p>Mapa interativo indisponível neste ambiente. A edição por coordenadas, GPS atual e abertura externa continuam disponíveis.</p> : null}
      </div>
    </div>
  );
}
