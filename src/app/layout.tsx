import type { Metadata, Viewport } from "next";
import type { CSSProperties } from "react";
import { headers } from "next/headers";
import { NextRequest } from "next/server";
import { PwaRegister } from "@/components/PwaRegister";
import { PwaStatus } from "@/components/PwaStatus";
import { BrandTheme } from "@/components/BrandTheme";
import { brandingCssVariables, type BrandingTheme } from "@/lib/branding/theme";
import { getTenantBranding } from "@/lib/server/branding";
import { requirePublicTenant } from "@/lib/server/public-tenant";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "NexPonto",
    template: "%s | NexPonto"
  },
  description: "Jornadas, escalas, pessoas e operações em um só lugar.",
  manifest: "/api/public/manifest",
  icons: {
    icon: "/nexponto-mark.svg",
    apple: "/nexponto-mark.svg"
  }
};

export const viewport: Viewport = {
  themeColor: "#0A1F4D",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover"
};

async function initialBranding(): Promise<BrandingTheme> {
  try {
    const requestHeaders = new Headers(await headers());
    const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost";
    const request = new NextRequest(`http://${host}/`, { headers: requestHeaders });
    const context = await requirePublicTenant(request);
    return await getTenantBranding(context.supabase);
  } catch {
    return { primary_color: "#1268F3", secondary_color: "#F4B51C", background_color: "#F5F7FB", surface_color: "#FFFFFF" };
  }
}

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const branding = await initialBranding();
  const themeStyle = brandingCssVariables(branding) as CSSProperties;
  return (
    <html lang="pt-BR" style={themeStyle}>
      <body>
        <BrandTheme appName={branding.app_name} />
        <PwaRegister />
        <PwaStatus />
        {children}
      </body>
    </html>
  );
}
