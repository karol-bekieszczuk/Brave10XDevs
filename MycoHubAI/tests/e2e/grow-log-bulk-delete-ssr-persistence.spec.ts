// risk: test-plan.md Phase 3 — grow-log mutation survives an SSR reload
// seed: tests/e2e/seed.spec.ts
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { getE2EFixtureEnvironment } from "./fixtures";
import { createUniqueGrowLogThroughUi } from "./seed.spec";

function requireHarnessEnvironment(name: "E2E_SUPABASE_SERVICE_ROLE_KEY" | "E2E_SUPABASE_URL") {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required. Start this spec through npm run test:e2e.`);
  }

  return value;
}

test.describe("Grow-log mutation and SSR persistence", () => {
  test("bulk deletion removes only the selected grow log after SSR reload", async ({ page }) => {
    const fixture = getE2EFixtureEnvironment();
    const runId = `${Date.now()}-${randomUUID()}`;
    const deletedTitle = `E2E delete ${runId}`;
    const survivorTitle = `E2E survivor ${runId}`;
    const createdTitles = [deletedTitle, survivorTitle];
    const admin = createClient(
      requireHarnessEnvironment("E2E_SUPABASE_URL"),
      requireHarnessEnvironment("E2E_SUPABASE_SERVICE_ROLE_KEY"),
      {
        auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
      },
    );

    try {
      // Create two unique grow logs through the authenticated browser flow.
      await page.goto("/grow-logs");
      await createUniqueGrowLogThroughUi(page, {
        body: `Delete candidate created by ${runId}`,
        stage: "agar",
        title: deletedTitle,
      });
      await createUniqueGrowLogThroughUi(page, {
        body: `Survivor created by ${runId}`,
        stage: "grain",
        title: survivorTitle,
      });

      await expect(page.getByRole("heading", { name: deletedTitle, exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: survivorTitle, exact: true })).toBeVisible();

      // Select exactly one row and accept the real confirmation dialog.
      await page.getByLabel(`Select ${deletedTitle}`, { exact: true }).check();
      const dialogPromise = page.waitForEvent("dialog");
      const deletePromise = page.getByRole("button", { name: "Delete selected", exact: true }).click();
      const dialog = await dialogPromise;
      expect(dialog.type()).toBe("confirm");
      expect(dialog.message()).toBe("Delete 1 selected grow log permanently? This cannot be undone.");
      await dialog.accept();
      await deletePromise;

      // Assert controlled feedback and the selected/survivor outcome after the redirect.
      await expect(page.getByText("Selected grow logs deleted.", { exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: deletedTitle, exact: true })).toHaveCount(0);
      await expect(page.getByRole("heading", { name: survivorTitle, exact: true })).toBeVisible();

      // Reload the SSR list and repeat the persistence assertions.
      await page.reload();
      await expect(page.getByRole("heading", { name: deletedTitle, exact: true })).toHaveCount(0);
      await expect(page.getByRole("heading", { name: survivorTitle, exact: true })).toBeVisible();
    } finally {
      // Delete only records created by this run; harness owner deletion is the final safety net.
      const { error } = await admin
        .from("grow_logs")
        .delete()
        .eq("owner_id", fixture.ownerId)
        .in("title", createdTitles);
      expect(error, `cleanup generated grow logs: ${error?.message ?? "unknown error"}`).toBeNull();
    }
  });
});
