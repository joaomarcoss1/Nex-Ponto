import type { Metadata, Viewport } from "next";
import { PwaRegister } from "@/components/PwaRegister";
import { PwaStatus } from "@/components/PwaStatus";
import { BrandTheme } from "@/components/BrandTheme";
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

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>
        <BrandTheme />
        <PwaRegister />
        <PwaStatus />
        {children}
      </body>
    </html>
  );
}
