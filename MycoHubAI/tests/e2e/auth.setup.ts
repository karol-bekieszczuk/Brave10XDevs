import { writeFile } from "node:fs/promises";
import { expect, test as setup } from "@playwright/test";
import {
  E2E_AUTH_STATE_PATH,
  E2E_BASE_URL,
  E2E_FORCED_FAILURE_MARKER_PATH,
  getE2EFixtureEnvironment,
} from "./fixtures";

setup("authenticate disposable owner through the application contract", async ({ browser, request }) => {
  const fixture = getE2EFixtureEnvironment();
  const signIn = await request.post("/api/auth/signin", {
    form: {
      email: fixture.email,
      password: fixture.password,
    },
    headers: {
      origin: E2E_BASE_URL,
    },
    maxRedirects: 0,
  });

  expect(signIn.status()).toBeGreaterThanOrEqual(300);
  expect(signIn.status()).toBeLessThan(400);
  expect(signIn.headers().location).toBe("/");
  await request.storageState({ path: E2E_AUTH_STATE_PATH });

  const authenticatedContext = await browser.newContext({ storageState: E2E_AUTH_STATE_PATH });

  try {
    const page = await authenticatedContext.newPage();
    await page.goto("/grow-logs");
    await expect(
      page.getByRole("heading", { name: "Track agar and grain work without leaving the MVP scope." }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/grow-logs$/);
  } finally {
    await authenticatedContext.close();
  }

  if (process.env.E2E_FORCE_SETUP_FAILURE === "1") {
    await writeFile(E2E_FORCED_FAILURE_MARKER_PATH, "authenticated runtime verification completed\n");
    throw new Error("Forced E2E setup failure after authenticated runtime verification.");
  }
});
