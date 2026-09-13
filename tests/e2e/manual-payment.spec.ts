import { test, expect } from "@playwright/test";
test("reception sale and full refund retain operation history", async ({
  page,
}) => {
  test.skip(
    !process.env.E2E_OWNER_EMAIL || !process.env.E2E_PASSWORD,
    "Requires seeded owner credentials",
  );
  await page.goto("/login");
  await page.getByLabel("Электронная почта").fill(process.env.E2E_OWNER_EMAIL!);
  await page
    .getByLabel("Пароль", { exact: true })
    .fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await page.waitForURL("**/admin");
  await page.goto("/admin/payments");
  await page.getByRole("button", { name: "Оформить продажу" }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Клиент", { exact: true })
    .selectOption({ label: "Александра Морозова" });
  const options = await dialog
    .getByLabel("Абонемент", { exact: true })
    .locator("option")
    .allTextContents();
  await dialog
    .getByLabel("Абонемент", { exact: true })
    .selectOption({ label: options.find((s) => s.includes("Первый шаг"))! });
  await dialog.getByLabel("Способ оплаты").selectOption("TERMINAL");
  await dialog
    .getByLabel("Основание регистрации")
    .fill("Оплата получена на рецепции");
  const saved = page.waitForResponse(
    (r) =>
      r.url().endsWith("/manual-payment") && r.request().method() === "POST",
  );
  await dialog
    .getByRole("button", { name: "Подтвердить получение оплаты" })
    .click();
  const response = await saved;
  expect(response.status()).toBe(201);
  const p = await response.json();
  await page.goto("/admin/payments/" + p.id);
  await page.getByRole("button", { name: "Оформить возврат" }).click();
  await dialog
    .getByLabel("Причина", { exact: true })
    .fill("Клиент выбрал другой абонемент");
  await dialog.getByRole("button", { name: "Рассчитать последствия" }).click();
  await expect(dialog).toContainText("Абонемент будет прекращён");
  await dialog.getByRole("button", { name: "Подтвердить возврат" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByText("900 ₽ · Возвращено", { exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await page.reload();
  await expect(
    page.getByRole("link", { name: "Подтверждение", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("900 ₽ · Возвращено", { exact: true }),
  ).toBeVisible();
  if (process.env.E2E_ARTIFACT_DIR)
    await page.screenshot({
      path: process.env.E2E_ARTIFACT_DIR + "/payment-detail.png",
      fullPage: true,
      animations: "disabled",
    });
});
