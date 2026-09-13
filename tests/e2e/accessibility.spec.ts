import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
for (const route of ["/", "/schedule", "/memberships", "/login"]) {
  test("accessible public page " + route, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(route);
    await expect(page.locator("h1")).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      results.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
    ).toEqual([]);
  });
}

test("accessible management screens", async ({ page }) => {
  test.skip(!process.env.E2E_PASSWORD, "Requires seeded club");
  test.setTimeout(120000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/login");
  await page.getByLabel("Электронная почта").fill("owner@stride.local");
  await page
    .getByLabel("Пароль", { exact: true })
    .fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await page.waitForURL("**/admin");
  for (const route of [
    "/admin",
    "/admin/clients",
    "/admin/schedule",
    "/admin/payments",
    "/admin/programs",
    "/admin/reports",
  ]) {
    await page.goto(route);
    await expect(page.locator("h1")).toBeVisible();
    if (route === "/admin/reports") {
      // Scan the populated report, after the export action leaves its loading state.
      await expect(
        page.getByRole("button", { name: "Подготовить CSV" }),
      ).toBeEnabled();
    }
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect
      .soft(
        results.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => ({
            target: n.target,
            summary: n.failureSummary,
          })),
        })),
        route,
      )
      .toEqual([]);
  }
});
