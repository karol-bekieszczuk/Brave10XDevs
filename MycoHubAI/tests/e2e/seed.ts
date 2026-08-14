// Seed exemplar for generated MycoHubAI E2E scenarios.
// Authentication is supplied by the setup project through storageState.
import { expect, type Page } from "@playwright/test";

export async function createUniqueGrowLogThroughUi(
  page: Page,
  growLog: { body: string; stage: "agar" | "grain"; title: string },
) {
  await page.getByRole("link", { name: "New grow log", exact: true }).click();
  await page.getByLabel("Stage").selectOption(growLog.stage);
  await page.getByLabel("Title").fill(growLog.title);
  await page.getByLabel("Body").fill(growLog.body);
  await page.getByRole("button", { name: "Create grow log", exact: true }).click();

  await expect(page.getByRole("heading", { name: growLog.title, exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Back to list", exact: true }).click();
  await expect(page).toHaveURL(/\/grow-logs$/);
}
