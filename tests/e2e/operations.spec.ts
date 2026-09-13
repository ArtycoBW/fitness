import { selectOption } from "./controls";
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test("reports export and lead workflow survive reload", async ({ page }) => {
  test.skip(!process.env.E2E_PASSWORD, "Requires seeded club");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/login");
  await page.getByLabel("Электронная почта").fill("owner@stride.local");
  await page
    .getByLabel("Пароль", { exact: true })
    .fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await page.waitForURL("**/admin");
  await page.goto("/admin/reports");
  await expect(
    page.getByRole("button", { name: "Подготовить CSV" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Подготовить CSV" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Скачать CSV" }).first().click();
  const download = await downloadPromise;
  const bytes = await readFile((await download.path())!);
  expect(bytes.toString("utf8")).toContain('"Сумма, коп."');
  expect(bytes.length).toBeGreaterThan(100);
  const name = "Обращение " + Date.now();
  const result = await page.evaluate(async (name) => {
    const csrf = decodeURIComponent(
      document.cookie
        .split("; ")
        .find((c) => c.startsWith("fitness_csrf="))!
        .split("=")[1]!,
    );
    const res = await fetch("/api/v1/public/leads", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrf,
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        name,
        phone: "+79001234567",
        email: "visitor@example.com",
        message: "Хочу познакомиться с клубом и выбрать программу",
        consent: true,
      }),
    });
    return res.status;
  }, name);
  expect(result).toBe(201);
  await page.goto("/admin/leads");
  await page.getByLabel("Поиск обращения").fill(name);
  await page.getByRole("link", { name, exact: true }).click();
  await selectOption(page.getByLabel("Статус", { exact: true }), "SCHEDULED");
  await selectOption(page.getByLabel("Ответственный"), {
    label: "Дарья Лебедева",
  });
  await page
    .getByLabel("Результат контакта")
    .fill("Согласовали знакомство с тренером в клубе");
  await page.getByRole("button", { name: "Сохранить результат" }).click();
  await expect(page.getByText("Обращение обновлено")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Ответственный")).toHaveText("Дарья Лебедева");
  await expect(
    page.getByText("Согласовали знакомство с тренером в клубе"),
  ).toBeVisible();
  await page.goto("/admin/settings");
  await expect(
    page.getByRole("heading", { name: "Настройки клуба" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/reports");
  await expect(
    page.getByRole("button", { name: "Подготовить CSV" }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  if (process.env.E2E_ARTIFACT_DIR)
    await page.screenshot({
      path: process.env.E2E_ARTIFACT_DIR + "/reports-mobile.png",
      fullPage: true,
    });
  expect(errors).toEqual([]);
});
test("notification preferences persist and unread center works", async ({
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
  const field = page.getByLabel("Письма о программах занятий");
  await expect(field).toBeVisible();
  const initial = await field.isChecked();
  await field.setChecked(!initial);
  await page.getByRole("button", { name: "Сохранить уведомления" }).click();
  await expect(page.getByText("Настройки уведомлений сохранены")).toBeVisible();
  await page.reload();
  await expect(field).toBeChecked({ checked: !initial });
  await field.setChecked(initial);
  await page.getByRole("button", { name: "Сохранить уведомления" }).click();
  await expect(page.getByText("Настройки уведомлений сохранены")).toBeVisible();
  await page.goto("/account/notifications");
  await page.getByLabel("Только непрочитанные").check();
  const all = page.getByRole("button", { name: "Прочитать все" });
  await expect(page.getByText("Загружаем уведомления…")).toHaveCount(0);
  if (await all.isEnabled()) await all.click();
  await expect(
    page.getByRole("heading", { name: "Всё прочитано" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Всё прочитано" }),
  ).toBeVisible();
});
