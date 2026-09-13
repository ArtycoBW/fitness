import { test, expect } from "@playwright/test";
test("client books from schedule and cancels with visit release", async ({
  page,
}) => {
  test.skip(
    !process.env.E2E_CLIENT_EMAIL || !process.env.E2E_PASSWORD,
    "Requires seeded purchased client and running worker",
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
