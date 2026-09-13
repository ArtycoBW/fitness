import { test, expect } from "@playwright/test";
test("client books from schedule and cancels with visit release", async ({
  page,
}) => {
  test.skip(
    !process.env.E2E_CLIENT_EMAIL || !process.env.E2E_PASSWORD,
    "Requires seeded client and running worker",
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/login");
  await page
    .getByLabel("Электронная почта")
    .fill(process.env.E2E_CLIENT_EMAIL!);
  await page
    .getByLabel("Пароль", { exact: true })
    .fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await page.waitForURL("**/account");
  await page.goto("/memberships");
  await page
    .locator(".public-plan")
    .filter({
      has: page.getByRole("heading", { name: "Свой ритм", exact: true }),
    })
    .getByRole("button", { name: "Выбрать абонемент" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Перейти к оплате" })
    .click();
  await page.waitForURL("**/checkout/*");
  await page.getByRole("button", { name: "Альфа Pay", exact: true }).click();
  await page.getByRole("button", { name: /^Оплатить \d/ }).click();
  await page.waitForURL("**/payments/*/confirmation");
  await expect(
    page.getByRole("heading", { name: "Всё получилось." }),
  ).toBeVisible();
  const tomorrow = new Date(Date.now() + 86400000 + 10800000)
    .toISOString()
    .slice(0, 10);
  await page.goto("/schedule?date=" + tomorrow + "&view=day");
  await page.locator(".calendar-event").first().click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Подтвердить запись", exact: true })
    .click();
  await expect(
    dialog.getByText("Запись подтверждена", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("link", { name: "Подробности записи →" }).click();
  await page.waitForURL("**/account/bookings/*");
  const bookingUrl = page.url();
  await expect(
    page.getByText("Зарезервировано", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Зарезервировано", { exact: true }),
  ).toBeVisible();
  if (process.env.E2E_ARTIFACT_DIR)
    await page.screenshot({
      path: process.env.E2E_ARTIFACT_DIR + "/booking-desktop.png",
      fullPage: true,
      animations: "disabled",
    });
  await page
    .getByRole("button", { name: "Отменить запись", exact: true })
    .click();
  await expect(dialog).toContainText("Посещение вернётся в доступный остаток");
  await dialog
    .getByRole("button", { name: "Подтвердить", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("Не списано", { exact: true })).toBeVisible();
  await page.goto(bookingUrl);
  await expect(page.getByText("Не списано", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  if (process.env.E2E_ARTIFACT_DIR)
    await page.screenshot({
      path: process.env.E2E_ARTIFACT_DIR + "/booking-mobile.png",
      fullPage: true,
      animations: "disabled",
    });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  expect(errors).toEqual([]);
});
