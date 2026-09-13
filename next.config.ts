import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  outputFileTracingRoot: process.cwd(),
  allowedDevOrigins: ["127.0.0.1", "localhost"],
<<<<<<< HEAD
  webpack(config) {
    if (process.env.NEXT_DISABLE_WEBPACK_CACHE === "1") config.cache = false;
    return config;
  },
  eslint: {
    ignoreDuringBuilds: process.env.NEXT_SKIP_BUILD_CHECKS === "1",
  },
  typescript: {
    ignoreBuildErrors: process.env.NEXT_SKIP_BUILD_CHECKS === "1",
  },
  experimental: process.env.NEXT_LOW_RESOURCE_BUILD === "1" ? {
    cpus: 1,
    memoryBasedWorkersCount: false,
    parallelServerCompiles: false,
    parallelServerBuildTraces: false,
    webpackMemoryOptimizations: true,
  } : undefined,
=======
>>>>>>> 2975acc099004b59e09f5b0f424e5739cdff40b3
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        { key: "Cross-Origin-Resource-Policy", value: "same-site" },
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
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
