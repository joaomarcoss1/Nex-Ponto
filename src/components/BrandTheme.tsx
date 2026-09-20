"use client";
import { useEffect } from "react";
import { brandingCssVariables, type BrandingTheme } from "@/lib/branding/theme";

function applyBranding(branding: BrandingTheme) {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(brandingCssVariables(branding))) root.style.setProperty(name, value);
  if (branding.app_name) document.title = branding.app_name;
}

export function BrandTheme({ appName }: { appName?: string }) {
  useEffect(() => {
    const updateBranding = (event: Event) => {
      const branding = (event as CustomEvent<BrandingTheme>).detail;
      if (branding) applyBranding(branding);
    };
    window.addEventListener("nexponto-branding-updated", updateBranding);
    if (appName) document.title = appName;
    return () => {
      window.removeEventListener("nexponto-branding-updated", updateBranding);
    };
  }, [appName]);
  return null;
}
