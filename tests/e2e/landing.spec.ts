import { test, expect } from "@playwright/test";
test("public landing catalogs, motion controls and contact submission", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Движениев вашемритме.",
  );
  await page.getByRole("button", { name: "Приостановить видео" }).click();
  await expect
    .poll(() =>
      page
        .locator(".stride-hero video")
        .first()
        .evaluate((v) => (v as HTMLVideoElement).paused),
    )
    .toBe(true);
  await page.locator("#directions").scrollIntoViewIfNeeded();
  const tabs = page
    .getByRole("group", { name: "Направления тренировок" })
    .getByRole("button");
  await tabs.first().focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(tabs.nth(1)).toHaveAttribute("aria-pressed", "true");
  await page
    .locator('.gallery-description[data-active="true"]')
    .getByRole("link", { name: "О направлении" })
    .click();
  await expect(page).toHaveURL(/\/workouts\//);
  await expect(
    page
      .locator("#main-content")
      .getByRole("link", { name: "Выбрать тренировку" }),
  ).toBeVisible();
  await page.goto("/");
  await page.locator("#spaces").scrollIntoViewIfNeeded();
  const halls = page
    .getByRole("group", { name: "Выбор зала" })
    .getByRole("button");
  await halls.nth(1).click();
  await expect(halls.nth(1)).toHaveAttribute("aria-pressed", "true");
  const schedule = page.getByRole("link", { name: "Расписание зала" });
  await expect(schedule).toHaveAttribute("href", /hallId=/);
  const color = await schedule.evaluate((el) => ({
    fg: getComputedStyle(el).color,
    bg: getComputedStyle(el).backgroundColor,
  }));
  expect(color.fg).not.toBe(color.bg);
  const questions = page.locator('#faq [data-slot="accordion-trigger"]');
  await questions.nth(1).click();
  await expect(questions.nth(1)).toHaveAttribute("aria-expanded", "true");
  await expect(questions.first()).toHaveAttribute("aria-expanded", "false");
  await page.locator("#contact").scrollIntoViewIfNeeded();
  await page
    .getByLabel("Ваше имя", { exact: true })
    .fill("Посетитель " + Date.now());
  await page.getByLabel("Телефон", { exact: true }).fill("+79001234567");
  await page
    .getByLabel("Расскажите о себе")
    .fill("Хочу познакомиться с клубом и начать занятия йогой.");
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Познакомиться с клубом", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "До скорой встречи." }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Открыть меню сайта" }).click();
  await page
    .getByRole("dialog")
    .getByRole("link", { name: "Тренеры", exact: true })
    .click();
  await expect(page).toHaveURL(/\/#team$/);
  await expect(page.locator("#team")).toBeInViewport();
  await expect(page.locator("#team h2")).toBeFocused();
  await page.getByRole("button", { name: "Открыть меню сайта" }).click();
  await page
    .getByRole("dialog")
    .getByRole("link", { name: "Направления", exact: true })
    .click();
  await expect(page).toHaveURL(/\/#directions$/);
  await expect(page.locator("#directions h2")).toBeFocused();
  await expect(page.locator("#directions")).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test("reduced motion and unavailable WebGL preserve usable content", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      type: string,
      ...args: unknown[]
    ) {
      if (type.includes("webgl")) return null;
      return Reflect.apply(get, this, [type, ...args]);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".stride-hero video")
        .first()
        .evaluate((v) => (v as HTMLVideoElement).paused),
    )
    .toBe(true);
  await page.locator("#spaces").scrollIntoViewIfNeeded();
  await page
    .getByRole("group", { name: "Выбор зала" })
    .getByRole("button")
    .last()
    .click();
  await expect(
    page.getByRole("img", { name: "Студия баланса", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Расписание зала" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: "Расписание занятий", exact: true }),
  ).toBeVisible();
});

test("touch hero loads video only after an explicit play request", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto(process.env.E2E_BASE_URL ?? "http://localhost:3000");
  await expect(page.locator(".stride-hero video")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Продолжить видео", exact: true })
    .click();
  await expect(page.locator(".stride-hero video").first()).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".stride-hero video")
        .first()
        .evaluate((v) => (v as HTMLVideoElement).paused),
    )
    .toBe(false);
  await page
    .getByRole("button", { name: "Приостановить видео", exact: true })
    .click();
  await expect
    .poll(() =>
      page
        .locator(".stride-hero video")
        .first()
        .evaluate((v) => (v as HTMLVideoElement).paused),
    )
    .toBe(true);
  await context.close();
});
