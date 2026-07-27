import { NextRequest, NextResponse } from "next/server";
import { requirePublicTenant } from "@/lib/server/public-tenant";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const context = await requirePublicTenant(request);
    const { data } = await context.rawSupabase
      .from("tenant_branding")
      .select("app_name,short_name,tagline,pwa_icon_url,primary_color,background_color")
      .eq("tenant_id", context.tenant.id)
      .maybeSingle();
    const icon = data?.pwa_icon_url || "/nexponto-mark.svg";
    return NextResponse.json({
      name: data?.app_name || context.tenant.displayName || "NexPonto",
      short_name: data?.short_name || "NexPonto",
      description: data?.tagline || "Jornadas, escalas e gestão de pessoas.",
      start_url: `/?tenant=${encodeURIComponent(context.tenant.slug)}`,
      scope: "/",
      display: "standalone",
      background_color: data?.background_color || "#F5F7FB",
      theme_color: data?.primary_color || "#0A1F4D",
      orientation: "portrait-primary",
      categories: ["business", "productivity"],
      icons: [{ src: icon, sizes: "any", type: icon.endsWith(".svg") ? "image/svg+xml" : "image/png", purpose: "any maskable" }]
    }, { headers: { "Cache-Control": "private, max-age=300", "Content-Type": "application/manifest+json" } });
  } catch {
    return NextResponse.json({
      name: "NexPonto", short_name: "NexPonto", start_url: "/", scope: "/", display: "standalone",
      background_color: "#F5F7FB", theme_color: "#0A1F4D", orientation: "portrait-primary",
      icons: [{ src: "/nexponto-mark.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }]
    }, { headers: { "Content-Type": "application/manifest+json" } });
  }
}
