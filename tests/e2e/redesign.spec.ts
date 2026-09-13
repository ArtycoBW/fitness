import { test, expect } from "@playwright/test";
test("account overlays preserve workspace, filters and card layout", async ({
  page,
}) => {
  test.skip(!process.env.E2E_PASSWORD, "Requires seeded club");
  await page.goto("/login");
  await page.getByLabel("Электронная почта").fill("client@stride.local");
  await page
    .getByLabel("Пароль", { exact: true })
    .fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await page.waitForURL("**/account");
  await expect(page.getByText("Собираем ваш день…")).toHaveCount(0);
  await expect(page.getByText(/Подтвердите email/)).toHaveCount(0);
  const cards = page.locator(".detail-grid > .surface");
  await expect(cards).toHaveCount(2);
  const sizes = await cards.evaluateAll((nodes) =>
    nodes.map((n) => Math.round(n.getBoundingClientRect().height)),
  );
  expect(sizes[0]).toBe(sizes[1]);
  await page.getByRole("link", { name: "Расписание", exact: true }).click();
  const modal = page.getByRole("dialog");
  await expect(
    modal.getByRole("heading", { name: "Расписание занятий" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/account$/);
  await modal.getByLabel("Дата расписания").click();
  await expect(page.getByRole("grid")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("grid")).toHaveCount(0);
  await modal.getByRole("button", { name: "Следующий период" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);
  await page
    .getByRole("link", { name: "Выбрать абонемент", exact: true })
    .click();
  await expect(modal.locator(".public-plan").first()).toBeVisible();
  await expect(modal.locator(".public-header")).toHaveCount(0);
  await modal
    .locator(".public-plan")
    .filter({
      has: page.getByRole("heading", { name: "Первый шаг", exact: true }),
    })
    .getByRole("button", { name: "Выбрать абонемент" })
    .click();
  await page
    .getByRole("dialog")
    .last()
    .getByRole("button", { name: "Перейти к оплате" })
    .click();
  await expect(
    modal.getByRole("heading", { name: "Место для движения." }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    modal.getByRole("button", { name: /^Оплатить \d/ }),
  ).toBeInViewport({ ratio: 1 });
  expect(
    await modal
      .locator(".workspace-modal-content")
      .evaluate((el) => el.scrollHeight <= el.clientHeight + 2),
  ).toBe(true);
  await modal.getByRole("button", { name: "Альфа Pay", exact: true }).click();
  await modal.getByRole("button", { name: /^Оплатить \d/ }).click();
  await expect(
    modal.getByRole("heading", { name: "Всё получилось." }),
  ).toBeVisible({ timeout: 20000 });
  await expect(page).toHaveURL(/\/account$/);
  await expect(
    modal.getByRole("button", { name: "Сохранить подтверждение", exact: true }),
  ).toBeInViewport({ ratio: 1 });
  await modal.getByRole("link", { name: "Мой абонемент", exact: true }).click();
  await expect(page).toHaveURL(/\/account\/memberships\/[^/]+$/);
  await expect(modal).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/account");
  await page
    .locator(".sidebar-desktop")
    .getByRole("link", { name: "Уведомления", exact: true })
    .click();
  await expect(
    modal.getByRole("heading", { name: "Уведомления", exact: true }).first(),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/account$/);
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Открепить меню", exact: true })
    .click();
  await page.mouse.move(1200, 100);
  const before = await page.locator(".app-main").boundingBox();
  await page.locator(".sidebar-desktop").hover();
  const after = await page.locator(".app-main").boundingBox();
  expect(after?.x).toBe(before?.x);
  await expect(page.getByRole("link", { name: "На сайт клуба" })).toHaveCount(
    0,
  );
  await page.mouse.move(1200, 100);
  await expect(page.getByRole("tooltip")).toHaveCount(0);
});
