import { test, expect } from "@playwright/test";

test("password feedback and reveal respect the shared new-password policy", async ({
  page,
}) => {
  await page.goto("/register");
  const password = page.getByLabel("Пароль", { exact: true });
  await password.fill("password123456!");
  expect(
    await password.evaluate((el: HTMLInputElement) => el.checkValidity()),
  ).toBe(false);
  await page
    .getByRole("button", { name: "Показать пароль", exact: true })
    .click();
  await expect(password).toHaveAttribute("type", "text");
  await page
    .getByRole("button", { name: "Скрыть пароль", exact: true })
    .click();
  await expect(password).toHaveAttribute("type", "password");
  await password.fill("НовыйРитм-2048!");
  expect(
    await password.evaluate((el: HTMLInputElement) => el.checkValidity()),
  ).toBe(true);
  await expect(page.getByText("Надёжный", { exact: true })).toBeVisible();
});

test("phone editing, collapsed icons and overlays remain stable during requests", async ({
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
  await page.goto("/account/profile");
  const phone = page.getByLabel("Телефон", { exact: true });
  await phone.fill("");
  await phone.pressSequentially("9991234567");
  await expect(phone).toHaveValue("+7 (999) 123-45-67");
  await phone.press("End");
  await phone.press("Backspace");
  await expect(phone).toHaveValue("+7 (999) 123-45-6");
  await phone.fill("89991234567");
  await expect(phone).toHaveValue("+7 (999) 123-45-67");
  // No changes are saved to this shared fixture account.
  await page.goto("/account");
  const unpin = page.getByRole("button", {
    name: "Открепить меню",
    exact: true,
  });
  await unpin.click();
  await page.getByRole("heading", { level: 1 }).click();
  await page.mouse.move(1200, 100);
  await expect(page.locator(".sidebar-desktop")).toHaveAttribute(
    "data-expanded",
    "false",
  );
  await expect
    .poll(() =>
      page.locator(".sidebar-desktop .sidebar-link").evaluateAll((nodes) =>
        Math.max(
          ...nodes.map((n) => {
            const icon = n.querySelector("svg")!.getBoundingClientRect(),
              link = n.getBoundingClientRect();
            return Math.abs(icon.x + icon.width / 2 - link.x - link.width / 2);
          }),
        ),
      ),
    )
    .toBeLessThan(1);
  await page.getByRole("link", { name: "Расписание", exact: true }).click();
  const modal = page.getByRole("dialog");
  await expect(modal.locator(".calendar-day")).toHaveCount(7);
  await expect(modal.locator(".calendar-event").first()).toBeVisible();
  const oldDays = await modal.locator(".calendar-day").allTextContents();
  await page.route("**/api/v1/public/schedule?**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.continue();
  });
  await modal.getByRole("button", { name: "Следующий период" }).click();
  await expect(modal.locator(".calendar-desktop")).toHaveAttribute(
    "data-updating",
    "true",
  );
  expect(await modal.locator(".calendar-day").allTextContents()).toEqual(
    oldDays,
  );
  await expect(modal.locator(".calendar-desktop")).toHaveAttribute(
    "data-updating",
    "false",
  );
  expect(await modal.locator(".calendar-day").allTextContents()).not.toEqual(
    oldDays,
  );
  const scrollOwners = await modal.evaluate((el) =>
    [el, ...el.querySelectorAll("*")]
      .filter(
        (n) =>
          n.scrollHeight > n.clientHeight + 2 &&
          /(auto|scroll)/.test(getComputedStyle(n).overflowY),
      )
      .map((n) => n.className),
  );
  expect(scrollOwners).toEqual(["calendar-wrap"]);
  await page.keyboard.press("Escape");
  await page
    .getByRole("link", { name: "Выбрать абонемент", exact: true })
    .click();
  await expect(modal.locator(".public-plan")).toHaveCount(3);
  expect(
    await modal.evaluate(
      (el) =>
        [el, ...el.querySelectorAll("*")].filter(
          (n) =>
            n.scrollHeight > n.clientHeight + 2 &&
            /(auto|scroll)/.test(getComputedStyle(n).overflowY),
        ).length,
    ),
  ).toBe(0);
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("link", { name: "Расписание", exact: true }).click();
  const rows = modal.locator(".agenda-row");
  await expect(rows.first()).toBeVisible();
  const bounds = await rows.evaluateAll((nodes) =>
    nodes.map((n) => {
      const box = n.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, height: box.height };
    }),
  );
  expect(
    bounds.every(
      (box, i) => box.height >= 95 && (!i || box.top >= bounds[i - 1]!.bottom),
    ),
  ).toBe(true);
});
