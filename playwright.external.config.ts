import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config";

export default defineConfig({
  ...baseConfig,
  use: { ...baseConfig.use, baseURL: process.env.E2E_BASE_URL || "http://127.0.0.1:3001" },
  webServer: undefined,
});
