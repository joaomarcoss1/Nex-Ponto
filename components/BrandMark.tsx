"use client";
import { publicFetch } from "@/lib/client/public-api";

import { clsx } from "clsx";
import { useEffect, useState } from "react";

type Branding = {
  app_name?: string;
  app_tagline?: string;
  mark_url?: string;
};

const fallback: Required<Branding> = {
  app_name: "NexPonto",
  app_tagline: "Gestão inteligente",
  mark_url: "/nexponto-mark.svg",
};

export function BrandMark({ compact = false, inverse = false }: { compact?: boolean; inverse?: boolean }) {
  const [branding, setBranding] = useState<Required<Branding>>(fallback);

  useEffect(() => {
    const update = (event: Event) => {
      const value = (event as CustomEvent<Branding>).detail;
      if (value) setBranding((current) => ({ ...current, ...value }));
    };
    window.addEventListener("nexponto-branding-updated", update);
    publicFetch("/api/public/branding", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (payload?.branding) setBranding((current) => ({ ...current, ...payload.branding }));
      })
      .catch(() => undefined);
    return () => window.removeEventListener("nexponto-branding-updated", update);
  }, []);

  return (
    <div className="flex min-w-0 items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={branding.mark_url}
        alt=""
        width={compact ? 44 : 58}
        height={compact ? 44 : 58}
        className="shrink-0 object-contain drop-shadow-[0_10px_22px_rgba(18,104,243,0.25)]"
      />
      <div className="min-w-0 leading-none">
        <p className={clsx("truncate text-lg font-black leading-tight tracking-[-0.04em]", inverse ? "text-white" : "text-slate-950")}>
          {branding.app_name}
        </p>
        <p className={clsx("truncate text-[9px] font-extrabold uppercase tracking-[0.16em]", inverse ? "text-blue-100" : "text-brand-600")}>
          {branding.app_tagline}
        </p>
      </div>
    </div>
  );
}
