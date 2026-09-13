import { test, expect } from "@playwright/test";

test("landing schedule opens in place and keeps hall filters", async ({
  page,
}) => {
  await page.route("**/api/v1/public/halls", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    await route.continue();
  });
  await page.goto("/");
  await page
    .locator("#spaces")
    .evaluate((node) => node.scrollIntoView({ behavior: "instant" }));
  const link = page.getByRole("link", { name: "Расписание зала", exact: true });
  const href = await link.getAttribute("href");
  const hallId = new URL(href!, "http://localhost").searchParams.get("hallId");
  await link.click();
  const modal = page.getByRole("dialog").first();
  await expect(modal).toBeVisible();
  await expect(
    modal.getByRole("heading", { name: "Расписание занятий" }),
  ).toBeVisible({ timeout: 15000 });
  await expect(page).toHaveURL(/\/$/);
  await expect
    .poll(async () => modal.getByRole("combobox").allTextContents())
    .toContain("Зал силы");
  expect(hallId).toBeTruthy();
  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden();
  await expect(link).toBeInViewport();
  await page
    .locator("#timetable")
    .evaluate((node) => node.scrollIntoView({ behavior: "instant" }));
  await page.locator('#timetable a[href="/schedule"]').click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: "Расписание занятий" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});

test("one fixed scroll cue follows the viewport and disappears at the footer", async ({
  page,
}) => {
  await page.goto("/");
  const cue = page.locator(".scroll-cue");
  await expect(cue).toHaveCount(1);
  for (const y of [0, 730, 1720]) {
    await page.evaluate(
      (top) => window.scrollTo({ top, behavior: "instant" }),
      y,
    );
    await expect(cue).toBeVisible();
    const rect = await cue.boundingBox();
    expect(Math.abs(rect!.x + rect!.width / 2 - 720)).toBeLessThan(2);
    expect(Math.abs(rect!.y + rect!.height - 984)).toBeLessThan(2);
    expect(await cue.evaluate((el) => getComputedStyle(el).position)).toBe(
      "fixed",
    );
  }
  const heights = await page
    .locator(".landing-main > section:not(.team-section)")
    .evaluateAll((nodes) =>
      nodes.map((n) => ({
        height: n.getBoundingClientRect().height,
        overflow: n.scrollHeight > n.clientHeight + 1,
      })),
    );
  expect(
    heights.every((n) => Math.abs(n.height - 1000) < 1 && !n.overflow),
  ).toBe(true);
  await page
    .locator("#footer")
    .evaluate((node) => node.scrollIntoView({ behavior: "instant" }));
  await expect(cue).toBeHidden();
  const groups = page.locator(".footer-marquee-group");
  await expect(groups).toHaveCount(2);
  expect(await groups.first().textContent()).toBe(
    await groups.last().textContent(),
  );
  expect((await groups.first().boundingBox())!.width).toBeGreaterThan(1440);
});

test("Almanac reveals the next trainer inside a pinned viewport", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .locator("#team")
    .evaluate((node) => node.scrollIntoView({ behavior: "instant" }));
  await expect(page.locator(".almanac-card").first()).toHaveAttribute(
    "class",
    /is-in/,
  );
  await page.getByRole("button", { name: "Следующий тренер" }).click();
  await expect(page.locator(".almanac-card").nth(1)).toHaveAttribute(
    "class",
    /is-in/,
  );
  await expect
    .poll(() =>
      page
        .locator(".almanac-card")
        .nth(1)
        .evaluate((n) => (n as HTMLElement).inert),
    )
    .toBe(false);
  const stage = await page.locator(".almanac-viewport").boundingBox();
  expect(Math.abs(stage!.y)).toBeLessThan(2);
  expect(Math.abs(stage!.height - 1000)).toBeLessThan(2);
  await page
    .locator(".almanac-card")
    .nth(1)
    .getByRole("link", { name: "Занятия с тренером" })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: "Расписание занятий" }),
  ).toBeVisible();
});
