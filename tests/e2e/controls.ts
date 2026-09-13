import { expect, type Locator } from "@playwright/test";
export async function selectOption(
  trigger: Locator,
  option: string | { label: string },
) {
  await trigger.click();
  const page = trigger.page();
  if (typeof option === "string")
    await page.locator('[role="option"][data-value="' + option + '"]').click();
  else
    await page.getByRole("option", { name: option.label, exact: true }).click();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
}
