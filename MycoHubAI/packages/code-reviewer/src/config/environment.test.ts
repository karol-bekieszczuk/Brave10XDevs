import { describe, expect, it, vi } from "vitest";

describe("environment configuration", () => {
  it("trims values and preserves a selected model", async () => {
    const { readEnvironment } = await import("./environment.js");
    expect(
      readEnvironment({
        OPENROUTER_API_KEY: "  secret  ",
        OPENROUTER_MODEL: "  openai/test-model  ",
      }),
    ).toEqual({
      OPENROUTER_API_KEY: "secret",
      OPENROUTER_MODEL: "openai/test-model",
    });
  });

  it("uses the default model when none is supplied", async () => {
    const { DEFAULT_OPENROUTER_MODEL, readEnvironment } = await import("./environment.js");
    expect(readEnvironment({ OPENROUTER_API_KEY: "secret" }).OPENROUTER_MODEL).toBe(DEFAULT_OPENROUTER_MODEL);
  });

  it.each([undefined, "", "   "])("rejects a missing or blank API key: %j", async (apiKey) => {
    const { readEnvironment } = await import("./environment.js");
    expect(() => readEnvironment({ OPENROUTER_API_KEY: apiKey })).toThrow("OPENROUTER_API_KEY is required");
  });

  it("does not validate process secrets at import time", async () => {
    vi.resetModules();
    vi.stubEnv("OPENROUTER_API_KEY", "");
    await expect(import("./environment.js")).resolves.toHaveProperty("readEnvironment");
    vi.unstubAllEnvs();
  });
});
