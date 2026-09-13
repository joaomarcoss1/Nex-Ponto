import { expect, test } from "@playwright/test";

for (const viewport of [
  { name: "360x800", width: 360, height: 800 },
  { name: "375x812", width: 375, height: 812 },
  { name: "390x844", width: 390, height: 844 },
  { name: "412x915", width: 412, height: 915 },
  { name: "430x932", width: 430, height: 932 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "tablet-820", width: 820, height: 1180 },
  { name: "tablet-1024", width: 1024, height: 768 },
  { name: "desktop-1440", width: 1440, height: 900 },
]) {
  test(`keeps login usable at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/admin/login");
    await expect(page.getByRole("heading", { name: "Acesso Administrativo" })).toBeVisible();
    await expect(page.getByLabel("E-mail")).toBeVisible();
    await expect(page.getByLabel("Senha")).toBeVisible();
    const submit = page.getByRole("button", { name: "Entrar" });
    await expect(submit).toBeVisible();
    const layout = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, submitHeight: document.querySelector('button[type="submit"]')?.getBoundingClientRect().height || 0 }));
    expect(layout.overflow).toBe(false);
    expect(layout.submitHeight).toBeGreaterThanOrEqual(44);
  });
}

test("respects reduced motion without making controls unusable", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/admin/login");
  await page.getByLabel("E-mail").fill("teste@example.com");
  await page.getByLabel("Senha").fill("senha-de-teste");
  await expect(page.getByLabel("E-mail")).toHaveValue("teste@example.com");
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
  const duration = await page.locator("button[type=submit]").evaluate((element) => getComputedStyle(element).transitionDuration);
  expect(Number.parseFloat(duration)).toBeLessThan(0.001);
});

test("legacy second-factor URL never presents a challenge", async ({ page }) => {
  await page.goto("/admin/seguranca-mfa");
  await expect(page).toHaveURL(/\/admin(?:\?|$)/);
  await expect(page.getByText(/aplicativo autenticador|código de seis dígitos/i)).toHaveCount(0);
});
