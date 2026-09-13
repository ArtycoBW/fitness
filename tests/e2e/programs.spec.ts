import { test, expect, type Page } from "@playwright/test";
test("trainer publishes and assigns a program, client records results, trainer reviews history", async ({
  page,
  browser,
}) => {
  test.skip(
    !process.env.E2E_TRAINER_EMAIL ||
      !process.env.E2E_CLIENT_EMAIL ||
      !process.env.E2E_PASSWORD,
    "Requires seeded club",
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const login = async (p: Page, email: string, area: string) => {
    await p.goto("/login");
    await p.getByLabel("Электронная почта").fill(email);
    await p
      .getByLabel("Пароль", { exact: true })
      .fill(process.env.E2E_PASSWORD!);
    await p.getByRole("button", { name: "Войти", exact: true }).click();
    await p.waitForURL("**/" + area);
  };
  await login(page, process.env.E2E_TRAINER_EMAIL!, "trainer");
  await page.goto("/trainer/programs/new");
  const title = "Практика устойчивости " + Date.now();
  await page.getByLabel("Название программы", { exact: true }).fill(title);
  await page
    .getByLabel("Цель", { exact: true })
    .fill("Контроль движения и спокойный темп");
  await page
    .getByLabel("Добавить упражнение в занятие 1", { exact: true })
    .selectOption({ label: "Ягодичный мост" });
  await page.getByLabel("Подходы", { exact: true }).fill("1");
  await page
    .getByRole("button", { name: "Сохранить черновик", exact: true })
    .click();
  await page.waitForURL(/\/trainer\/programs\/(?!new)[^/]+$/);
  await page
    .getByRole("button", { name: "Опубликовать версию", exact: true })
    .click();
  await expect(page.getByText(/Версия 1 ·/)).toBeVisible();
  await page
    .getByRole("button", { name: "Назначить клиенту", exact: true })
    .click();
  await page
    .getByLabel("Клиент", { exact: true })
    .selectOption({ label: "Александра Морозова" });
  await page
    .getByRole("button", { name: "Назначить программу", exact: true })
    .click();
  await page.waitForURL("**/trainer/assignments/*");
  const id = page.url().split("/").pop()!;
  const context = await browser.newContext({
      baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    }),
    client = await context.newPage();
  client.on("pageerror", (e) => errors.push(e.message));
  await login(client, process.env.E2E_CLIENT_EMAIL!, "account");
  await client.goto("/account/programs/" + id);
  await client
    .getByRole("button", { name: "Записать результаты", exact: true })
    .click();
  await client
    .getByLabel("Ягодичный мост, подход 1, результат", { exact: true })
    .fill("12");
  await client
    .getByLabel("Самочувствие и заметки")
    .fill("Движение стало увереннее");
  await client.getByLabel("Завершить день программы").check();
  await client
    .getByRole("button", { name: "Сохранить результаты", exact: true })
    .click();
  await expect(client.getByRole("dialog")).toHaveCount(0);
  await expect(client.getByText("Завершена", { exact: true })).toBeVisible();
  await client.reload();
  await expect(
    client.getByText("Движение стало увереннее", { exact: false }).first(),
  ).toBeVisible();
  await client.setViewportSize({ width: 390, height: 844 });
  if (process.env.E2E_ARTIFACT_DIR)
    await client.screenshot({
      path: process.env.E2E_ARTIFACT_DIR + "/program-mobile.png",
      fullPage: true,
      animations: "disabled",
    });
  expect(
    await client.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.reload();
  await expect(page.getByText("Завершена", { exact: true })).toBeVisible();
  await page.getByText("История изменений (1)", { exact: true }).click();
  await expect(page.getByText("Запись 1 ·", { exact: false })).toBeVisible();
  if (process.env.E2E_ARTIFACT_DIR)
    await page.screenshot({
      path: process.env.E2E_ARTIFACT_DIR + "/program-desktop.png",
      fullPage: true,
      animations: "disabled",
    });
  expect(errors).toEqual([]);
  await context.close();
});
