import { expect, test } from "@playwright/test";

/**
 * Extends the responsive coverage beyond /admin/login (see
 * admin-login-responsive.spec.ts) to the public employee-facing routes,
 * which previously had zero automated responsiveness coverage even though
 * PublicShell renders every one of them inside a fixed-width card
 * (`min(36rem, calc(100vw - 1.5rem))`) that must never overflow or clip,
 * on phones and on wide desktop screens alike.
 *
 * None of these routes require a logged-in session to render: the clock,
 * history and justification pages show an employee-search + PIN form, and
 * the portal pages (inicio/escala/perfil) show their "session required"
 * gate — both are real, stable UI that must stay usable at every width.
 */

const VIEWPORTS = [
  { name: "360x800", width: 360, height: 800 },
  { name: "390x844", width: 390, height: 844 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "tablet-1024", width: 1024, height: 768 },
  { name: "desktop-1440", width: 1440, height: 900 },
];

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  );
  expect(overflow).toBe(false);
}

const PIN_ENTRY_ROUTES: Array<{ path: string; heading: string }> = [
  { path: "/", heading: "Registro de Ponto" },
  { path: "/historico", heading: "Meu histórico" },
  { path: "/justificativa", heading: "Justificar falta" },
];

for (const route of PIN_ENTRY_ROUTES) {
  for (const viewport of VIEWPORTS) {
    test(`${route.path} stays usable at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(route.path);
      await expect(page.getByRole("heading", { name: route.heading })).toBeVisible();
      await expect(page.getByPlaceholder("Matrícula ou nome")).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });
  }
}

const SESSION_GATED_ROUTES = ["/inicio", "/escala", "/perfil"];

for (const path of SESSION_GATED_ROUTES) {
  for (const viewport of VIEWPORTS) {
    test(`${path} shows the session gate without overflow at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(path);
      await expect(page.getByRole("heading", { name: "Acesso do funcionário necessário" })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole("link", { name: "Validar no ponto" })).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });
  }
}

test("the public shell card never grows past its intended max width on wide screens", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const cardWidth = await page.locator(".public-shell-wrap").first().evaluate((element) => element.getBoundingClientRect().width);
  // min(36rem, calc(100vw - 1.5rem)) — 36rem at the default 16px root is 576px.
  expect(cardWidth).toBeLessThanOrEqual(577);
  await expectNoHorizontalOverflow(page);
});

test("/validar-gps renders its own shell responsively without a token", async ({ page }) => {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto("/validar-gps");
    await expectNoHorizontalOverflow(page);
  }
});
