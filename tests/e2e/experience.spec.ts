import { test, expect } from "@playwright/test";

test("first visit intro ends after three seconds and stays dismissed", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".site-intro")).toBeVisible();
  await expect(
    page.locator(".tetris-grid span[data-filled=true]").first(),
  ).toBeVisible();
  await expect(page.locator("html")).not.toHaveAttribute("data-intro", /./, {
    timeout: 5000,
  });
  const elapsed = await page.evaluate(
    () =>
      performance.now() -
      (window as Window & { __strideIntroStart: number }).__strideIntroStart,
  );
  expect(elapsed).toBeGreaterThanOrEqual(2900);
  expect(elapsed).toBeLessThan(4300);
  await expect(page.locator("#site-content")).not.toHaveAttribute("inert", "");
  await page.reload();
  await expect(page.locator(".site-intro")).toBeHidden();
  expect(errors).toEqual([]);
});

test("directions fill the viewport and trainer cards remain centered without arrows", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("stride-intro-seen", "1"),
  );
  await page.goto("/");
  await page
    .locator("#directions")
    .evaluate((el) => el.scrollIntoView({ behavior: "instant" }));
  const bounds = await page.locator("#directions .colonnade").boundingBox();
  const viewport = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    height: innerHeight,
  }));
  expect(bounds?.x).toBe(0);
  expect(bounds?.width).toBe(viewport.width);
  expect(bounds?.height).toBe(viewport.height);
  await expect(page.getByText("Разные движения.")).toHaveCount(0);
  await page
    .locator("#team")
    .evaluate((el) => el.scrollIntoView({ behavior: "instant" }));
  await expect(
    page.getByRole("button", { name: "Следующий тренер" }),
  ).toHaveCount(0);
  const card = await page.locator(".almanac-card").first().boundingBox();
  expect(card!.y + card!.height / 2).toBeLessThan(viewport.height * 0.65);
  expect(card!.y + card!.height).toBeLessThan(viewport.height - 90);
  const region = page.getByRole("region", { name: /^Тренеры клуба/ });
  await region.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".almanac-navigation")).toContainText("02 / 07");
});

test("auth navigation preserves artwork and uses a smooth form entrance", async ({
  page,
}) => {
  await page.goto("/login");
  await page
    .locator(".auth-art")
    .evaluate((el) => el.setAttribute("data-persisted", "yes"));
  await page
    .getByRole("link", { name: "Зарегистрироваться", exact: true })
    .click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(
    page.getByRole("heading", { name: "Начните свой ритм" }),
  ).toBeVisible();
  await expect(page.locator(".auth-art")).toHaveAttribute(
    "data-persisted",
    "yes",
  );
  expect(
    await page
      .locator(".auth-form")
      .evaluate((el) => getComputedStyle(el).animationDuration),
  ).toBe("0.65s");
  await page.getByRole("link", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator(".auth-art")).toHaveAttribute(
    "data-persisted",
    "yes",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page
    .getByRole("link", { name: "Зарегистрироваться", exact: true })
    .click();
  await expect(page).toHaveURL(/\/register$/);
  expect(
    await page
      .locator(".auth-form")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
});

test("full-height directions remain usable on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() =>
    localStorage.setItem("stride-intro-seen", "1"),
  );
  await page.goto("/");
  await page
    .locator("#directions")
    .evaluate((el) => el.scrollIntoView({ behavior: "instant" }));
  const buttons = page
    .getByRole("group", { name: "Направления тренировок" })
    .getByRole("button");
  await buttons.last().click();
  await expect(buttons.last()).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.locator('.colonnade-column[data-active="true"] a'),
  ).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  expect((await page.locator("#directions").boundingBox())?.height).toBe(844);
});
