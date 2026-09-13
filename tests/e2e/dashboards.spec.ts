import { test, expect } from "@playwright/test";
const cases = [
  ["OWNER", "owner@stride.local", "admin"],
  ["RECEPTION", "reception@stride.local", "admin"],
  ["TRAINER", "trainer@stride.local", "trainer"],
  ["CLIENT", "client@stride.local", "account"],
] as const;
for (const [role, email, area] of cases)
  test(
    role + " workspace navigation and responsive overview",
    async ({ page }) => {
      test.skip(!process.env.E2E_PASSWORD, "Requires seeded club");
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto("/login");
      await page.getByLabel("Электронная почта").fill(email);
      await page
        .getByLabel("Пароль", { exact: true })
        .fill(process.env.E2E_PASSWORD!);
      await page.getByRole("button", { name: "Войти", exact: true }).click();
      await page.waitForURL("**/" + area);
      await expect(
        page.getByRole("heading", { name: /Здравствуйте/ }),
      ).toBeVisible();
      await expect(page.getByText("Собираем ваш день…")).toHaveCount(0);
      if (area === "admin") {
        await page.getByLabel("Быстрый поиск клиента").fill("Александра");
        await page.getByRole("link", { name: "Продажа", exact: true }).click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await expect(
          page.getByLabel("Клиент", { exact: true }).locator("option:checked"),
        ).toHaveText("Александра Морозова");
        await page.keyboard.press("Escape");
        if (role === "OWNER") {
          await page.goto("/admin/users");
          await page
            .getByLabel("Поиск пользователя")
            .fill("trainer@stride.local");
          await expect(
            page.getByRole("cell", { name: /Анна Соколова/ }),
          ).toBeVisible();
          await page.goto("/admin/programs/new");
          await expect(
            page.getByLabel("Тренер — автор").locator("option"),
          ).not.toHaveCount(1);
        }
      }
      if (area === "trainer") {
        await page.goto("/trainer/clients");
        await page
          .getByRole("link", { name: "Александра Морозова", exact: true })
          .click();
        await expect(
          page.getByRole("heading", {
            name: "Александра Морозова",
            exact: true,
          }),
        ).toBeVisible();
      }
      if (area === "account") {
        await expect(
          page.getByRole("heading", { name: "Ваши абонементы", exact: true }),
        ).toBeVisible();
        await expect(
          page.locator(".overview-membership").first(),
        ).toBeVisible();
      }
      await page.goto("/" + area);
      await expect(page.getByText("Собираем ваш день…")).toHaveCount(0);
      await page
        .getByRole("button", { name: "Открепить меню", exact: true })
        .click();
      await page.mouse.move(900, 200);
      await page.reload();
      await expect(
        page.getByRole("button", { name: "Закрепить меню", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Закрепить меню", exact: true })
        .click();
      await page.setViewportSize({ width: 390, height: 844 });
      await page
        .getByRole("button", { name: "Открыть меню", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page
        .getByRole("dialog")
        .getByRole("link", { name: "Профиль", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Профиль", exact: true }),
      ).toBeVisible();
      await page.goto("/" + area);
      await expect(page.getByText("Собираем ваш день…")).toHaveCount(0);
      await expect(
        page.getByRole("heading", {
          name: area === "account" ? "Ваши абонементы" : "Сегодня в расписании",
          exact: true,
        }),
      ).toBeVisible();
      if (process.env.E2E_ARTIFACT_DIR)
        await page.screenshot({
          path:
            process.env.E2E_ARTIFACT_DIR +
            "/dashboard-" +
            role.toLowerCase() +
            "-mobile.png",
          fullPage: true,
          animations: "disabled",
        });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBe(false);
      expect(errors).toEqual([]);
    },
  );
