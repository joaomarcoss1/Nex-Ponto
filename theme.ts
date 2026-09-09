export type BrandingTheme = {
  app_name?: string;
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
  background_color?: string;
  surface_color?: string;
};

const DEFAULT_PRIMARY = "#1268F3";
const DEFAULT_SECONDARY = "#F4B51C";

export function safeHex(value: string | null | undefined, fallback: string) {
  return /^#[0-9a-f]{6}$/i.test(value || "") ? String(value).toUpperCase() : fallback;
}

function rgb(hex: string): [number, number, number] {
  const safe = safeHex(hex, DEFAULT_PRIMARY);
  return [1, 3, 5].map((start) => Number.parseInt(safe.slice(start, start + 2), 16)) as [number, number, number];
}

function mix(hex: string, target: [number, number, number], weight: number) {
  const source = rgb(hex);
  return source.map((value, index) => Math.round(value + (target[index] - value) * weight)).join(" ");
}

function luminance(hex: string) {
  const channels = rgb(hex).map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

export function accessibleForeground(background: string) {
  const value = luminance(background);
  const whiteContrast = 1.05 / (value + 0.05);
  const darkContrast = (value + 0.05) / 0.05;
  return whiteContrast >= darkContrast ? "#FFFFFF" : "#0F172A";
}

export function brandingCssVariables(branding: BrandingTheme): Record<string, string> {
  const allowTenantColors = process.env.NEXT_PUBLIC_ALLOW_TENANT_COLOR_OVERRIDE === "true";
  const primary = allowTenantColors ? safeHex(branding.primary_color, DEFAULT_PRIMARY) : DEFAULT_PRIMARY;
  const secondary = allowTenantColors ? safeHex(branding.secondary_color, DEFAULT_SECONDARY) : DEFAULT_SECONDARY;
  const variables: Record<string, string> = {
    "--brand": primary,
    "--brand-foreground": accessibleForeground(primary),
    "--brand-dark": `rgb(${mix(primary, [0, 0, 0], 0.58)})`,
    "--sun": secondary,
    "--background": allowTenantColors ? safeHex(branding.background_color, "#F5F7FB") : "#F5F7FB",
    "--surface": allowTenantColors ? safeHex(branding.surface_color, "#FFFFFF") : "#FFFFFF",
    "--success": "#16803C",
    "--warning": "#B45309",
    "--danger": "#B91C1C",
    "--info": "#0369A1",
  };
  const shades = [
    [50, mix(primary, [255, 255, 255], 0.92)],
    [100, mix(primary, [255, 255, 255], 0.84)],
    [200, mix(primary, [255, 255, 255], 0.70)],
    [300, mix(primary, [255, 255, 255], 0.52)],
    [400, mix(primary, [255, 255, 255], 0.28)],
    [500, mix(primary, [255, 255, 255], 0.10)],
    [600, rgb(primary).join(" ")],
    [700, mix(primary, [0, 0, 0], 0.16)],
    [800, mix(primary, [0, 0, 0], 0.30)],
    [900, mix(primary, [0, 0, 0], 0.45)],
    [950, mix(primary, [0, 0, 0], 0.64)],
  ] as const;
  const accentShades = [
    [50, mix(secondary, [255, 255, 255], 0.90)],
    [100, mix(secondary, [255, 255, 255], 0.78)],
    [200, mix(secondary, [255, 255, 255], 0.58)],
    [300, mix(secondary, [255, 255, 255], 0.30)],
    [400, rgb(secondary).join(" ")],
    [500, mix(secondary, [0, 0, 0], 0.12)],
    [600, mix(secondary, [0, 0, 0], 0.28)],
  ] as const;
  for (const [shade, value] of shades) variables[`--color-brand-${shade}`] = value;
  for (const [shade, value] of accentShades) variables[`--color-accent-${shade}`] = value;
  variables["--accent"] = allowTenantColors ? safeHex(branding.accent_color, "#22A5F5") : "#22A5F5";
  return variables;
}
