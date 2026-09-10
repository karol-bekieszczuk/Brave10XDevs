import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createOpenRouter: vi.fn(),
  createReviewer: vi.fn(),
  generate: vi.fn(),
}));

vi.mock("@openrouter/ai-sdk-provider", () => ({ createOpenRouter: mocks.createOpenRouter }));
vi.mock("./agent/reviewer.js", () => ({ createReviewer: mocks.createReviewer }));

describe("generateResponse", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.createOpenRouter.mockReturnValue(vi.fn(() => ({ id: "configured-model" })));
    mocks.createReviewer.mockReturnValue({ generate: mocks.generate });
    mocks.generate.mockResolvedValue({ findings: [] });
  });

  it("validates configuration, builds an injected reviewer, and supplies the requested root", async () => {
    const { generateResponse } = await import("./generate-response.js");

    await expect(
      generateResponse(
        "Review this.",
        { OPENROUTER_API_KEY: " secret ", OPENROUTER_MODEL: " openai/test " },
        "C:/repo",
      ),
    ).resolves.toEqual({ findings: [] });

    expect(mocks.createOpenRouter).toHaveBeenCalledWith({ apiKey: "secret" });
    expect(mocks.createReviewer).toHaveBeenCalledWith({ id: "configured-model" });
    expect(mocks.generate).toHaveBeenCalledWith({ prompt: "Review this.", repositoryRoot: "C:/repo" });
  });

  it("propagates configuration and generation failures", async () => {
    const { generateResponse } = await import("./generate-response.js");
    await expect(generateResponse("Review this.", {})).rejects.toThrow("OPENROUTER_API_KEY is required");

    mocks.generate.mockRejectedValueOnce(new Error("provider unavailable"));
    await expect(generateResponse("Review this.", { OPENROUTER_API_KEY: "secret" })).rejects.toThrow(
      "provider unavailable",
    );
  });
});
