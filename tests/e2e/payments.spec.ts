import { test, expect, type BrowserContext } from "@playwright/test";
import {
  MultiFormatReader,
  RGBLuminanceSource,
  HybridBinarizer,
  BinaryBitmap,
} from "@zxing/library";
test.describe("Client purchase and confirmation", () => {
  let cookies: Awaited<ReturnType<BrowserContext["cookies"]>> = [];
  test.skip(
    !process.env.E2E_CLIENT_EMAIL || !process.env.E2E_PASSWORD,
    "Requires seeded client credentials and running API, web and worker",
  );
  test.beforeAll(async ({ browser }) => {
    if (!process.env.E2E_CLIENT_EMAIL || !process.env.E2E_PASSWORD) return;
    const context = await browser.newContext(),
      page = await context.newPage();
    await page.goto(
      (process.env.E2E_BASE_URL ?? "http://localhost:3000") + "/login",
    );
    await page
      .getByLabel("Электронная почта")
      .fill(process.env.E2E_CLIENT_EMAIL);
    await page
      .getByLabel("Пароль", { exact: true })
      .fill(process.env.E2E_PASSWORD);
    await page.getByRole("button", { name: "Войти", exact: true }).click();
    await page.waitForURL("**/account");
    cookies = await context.cookies();
    await context.close();
  });
  for (const method of ["Карта", "Альфа Pay", "Яндекс Pay", "Сбер Pay"])
    test("purchase with " + method, async ({ page }) => {
      const errors: string[] = [],
        payloads: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("request", (r) => {
        if (r.method() === "POST") payloads.push(r.postData() ?? "");
      });
      await page.context().addCookies(cookies);
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
      await page
        .getByRole("heading", { name: "Место для движения." })
        .waitFor();
      if (method === "Карта") {
        await page.getByLabel("Владелец карты").fill("Alexandra Morozova");
        await page.getByLabel("Номер карты").fill("4111111111111111");
        await page.getByLabel("Срок действия").fill("1235");
        await page.getByLabel("CVV / CVC").fill("234");
      } else
        await page.getByRole("button", { name: method, exact: true }).click();
      if (process.env.E2E_ARTIFACT_DIR && method === "Карта")
        await page.screenshot({
          path: process.env.E2E_ARTIFACT_DIR + "/checkout-desktop.png",
          fullPage: true,
          animations: "disabled",
        });
      await page.getByRole("button", { name: /^Оплатить \d/ }).click();
      await page.waitForURL("**/payments/*/confirmation");
      await expect(
        page.getByRole("heading", { name: "Всё получилось." }),
      ).toBeVisible();
      await expect(page.locator(".ticket-method")).toContainText(
        method === "Карта" ? "Банковская карта" : method,
      );
      expect(
        payloads.some(
          (s) =>
            s.includes("4111111111111111") ||
            s.includes("4111 1111 1111 1111") ||
            s.includes('"cvv"') ||
            s.includes('"cardNumber"'),
        ),
      ).toBe(false);
      const stored = await page.evaluate(() =>
        JSON.stringify({ ...localStorage, ...sessionStorage }),
      );
      expect(stored).not.toContain("4111111111111111");
      const ref = await page.locator(".ticket-barcode p").innerText();
      const raster = await page
        .locator(".ticket-barcode svg")
        .evaluate(async (node) => {
          const svg = node as SVGSVGElement;
          const img = new Image();
          img.src =
            "data:image/svg+xml;charset=utf-8," +
            encodeURIComponent(new XMLSerializer().serializeToString(svg));
          await img.decode();
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(img, 0, 0);
          const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data,
            luma = [];
          for (let i = 0; i < rgba.length; i += 4)
            luma.push((rgba[i]! + 2 * rgba[i + 1]! + rgba[i + 2]!) / 4);
          return { width: canvas.width, height: canvas.height, luma };
        });
      const decoded = new MultiFormatReader().decodeWithState(
        new BinaryBitmap(
          new HybridBinarizer(
            new RGBLuminanceSource(
              new Uint8ClampedArray(raster.luma),
              raster.width,
              raster.height,
            ),
          ),
        ),
      );
      expect(decoded.getText()).toBe(ref);
      await page.reload();
      await expect(page.locator(".ticket-barcode p")).toHaveText(ref);
      if (process.env.E2E_ARTIFACT_DIR && method === "Карта") {
        await page.screenshot({
          path: process.env.E2E_ARTIFACT_DIR + "/confirmation-desktop.png",
          fullPage: true,
          animations: "disabled",
        });
        await page.setViewportSize({ width: 390, height: 844 });
        await page.screenshot({
          path: process.env.E2E_ARTIFACT_DIR + "/confirmation-mobile.png",
          fullPage: true,
          animations: "disabled",
        });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
        ).toBe(false);
      }
      expect(errors).toEqual([]);
    });
});
