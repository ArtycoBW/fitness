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
    .getByRole("tablist", { name: "Направления тренировок" })
    .getByRole("tab");
  await tabs.first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await page
    .getByRole("tabpanel")
    .getByRole("link", { name: "О направлении" })
    .click();
  await expect(page).toHaveURL(/\/workouts\//);
  await expect(
    page.getByRole("link", { name: "Выбрать тренировку" }),
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
  await page.locator("#faq summary").first().click();
  await expect(page.locator("#faq details").first()).toHaveAttribute(
    "open",
    "",
  );
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
  await expect(page).toHaveURL(/\/trainers$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Тренеры");
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
  await expect(page.getByRole("img", { name: "Схема зала" })).toBeVisible();
  await page.getByRole("link", { name: "Расписание зала" }).click();
  await expect(page).toHaveURL(/hallId=/);
  await expect(
    page.getByRole("heading", { name: "Расписание занятий", exact: true }),
  ).toBeVisible();
});
