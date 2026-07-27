import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      ],
    }];
  },
  // Mantém o PDFKit como pacote externo na Vercel para evitar que o bundler
  // perca os arquivos internos de fonte AFM, como Helvetica.afm.
  serverExternalPackages: ["pdfkit"],
  outputFileTracingIncludes: {
    // Somente a rota que realmente gera PDF precisa carregar as fontes e logos.
    // Aplicar o tracing a todas as APIs administrativas tornava o build lento e
    // aumentava desnecessariamente o pacote serverless.
    "/api/admin/reports": ["./node_modules/pdfkit/js/data/**/*"],
  },
};

export default nextConfig;
