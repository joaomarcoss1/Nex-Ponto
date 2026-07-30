import { expect, test } from "@playwright/test";

test("delivers security headers and keeps branding stable after reload", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response?.headers()["content-security-policy"]).toContain("default-src 'self'");
  expect(response?.headers()["content-security-policy"]).toContain("'strict-dynamic'");
  expect(response?.headers()["content-security-policy"]).not.toContain("script-src 'self' 'unsafe-inline'");
  const initialBrand = await page.locator("html").evaluate((element) => getComputedStyle(element).getPropertyValue("--brand").trim());
  await page.reload();
  const reloadedBrand = await page.locator("html").evaluate((element) => getComputedStyle(element).getPropertyValue("--brand").trim());
  expect(initialBrand).toBeTruthy();
  expect(reloadedBrand).toBe(initialBrand);
  expect(reloadedBrand.toLowerCase()).toBe("#1268f3");
});
