"use client";
import { publicFetch } from "@/lib/client/public-api";

import { useEffect } from "react";

type Branding = {
  app_name?: string;
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
  background_color?: string;
  surface_color?: string;
};

function rgb(hex: string) {
  const safe = /^#[0-9a-f]{6}$/i.test(hex) ? hex : "#1268F3";
  return [1, 3, 5].map((start) => Number.parseInt(safe.slice(start, start + 2), 16));
}

function mix(hex: string, target: [number, number, number], weight: number) {
  const source = rgb(hex);
  return source.map((value, index) => Math.round(value + (target[index] - value) * weight)).join(" ");
}

function applyBranding(branding: Branding) {
  const root = document.documentElement;
  const primary = branding.primary_color || "#1268F3";
  const accent = branding.secondary_color || "#F4B51C";
  const shades = [
    [50, mix(primary, [255, 255, 255], 0.92)],
    [100, mix(primary, [255, 255, 255], 0.84)],
    [200, mix(primary, [255, 255, 255], 0.7)],
    [300, mix(primary, [255, 255, 255], 0.52)],
    [400, mix(primary, [255, 255, 255], 0.28)],
    [500, mix(primary, [255, 255, 255], 0.1)],
    [600, rgb(primary).join(" ")],
    [700, mix(primary, [0, 0, 0], 0.16)],
    [800, mix(primary, [0, 0, 0], 0.3)],
    [900, mix(primary, [0, 0, 0], 0.45)],
    [950, mix(primary, [0, 0, 0], 0.64)]
  ] as const;
  const accentShades = [
    [50, mix(accent, [255, 255, 255], 0.9)],
    [100, mix(accent, [255, 255, 255], 0.78)],
    [200, mix(accent, [255, 255, 255], 0.58)],
    [300, mix(accent, [255, 255, 255], 0.3)],
    [400, rgb(accent).join(" ")],
    [500, mix(accent, [0, 0, 0], 0.12)],
    [600, mix(accent, [0, 0, 0], 0.28)]
  ] as const;
  shades.forEach(([shade, value]) => root.style.setProperty(`--color-brand-${shade}`, value));
  accentShades.forEach(([shade, value]) => root.style.setProperty(`--color-accent-${shade}`, value));
  root.style.setProperty("--background", branding.background_color || "#F5F7FB");
  root.style.setProperty("--surface", branding.surface_color || "#FFFFFF");
  root.style.setProperty("--brand", primary);
  root.style.setProperty("--brand-dark", `rgb(${mix(primary, [0, 0, 0], 0.58)})`);
  root.style.setProperty("--sun", accent);
  if (branding.accent_color) root.style.setProperty("--accent", branding.accent_color);
  if (branding.app_name) document.title = branding.app_name;
}

export function BrandTheme() {
  useEffect(() => {
    let active = true;
    const updateBranding = (event: Event) => {
      const branding = (event as CustomEvent<Branding>).detail;
      if (branding) applyBranding(branding);
    };
    window.addEventListener("nexponto-branding-updated", updateBranding);
    publicFetch("/api/public/branding", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (active && payload?.branding) applyBranding(payload.branding);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      window.removeEventListener("nexponto-branding-updated", updateBranding);
    };
  }, []);
  return null;
}
