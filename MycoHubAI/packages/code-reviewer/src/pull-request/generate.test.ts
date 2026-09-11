import { beforeEach, describe, expect, it, vi } from "vitest";
import { pullRequestReviewRequestSchema } from "./schema.js";

const mocks = vi.hoisted(() => ({
  createOpenRouter: vi.fn(),
  createPullRequestReviewer: vi.fn(),
  generate: vi.fn(),
}));

vi.mock("@openrouter/ai-sdk-provider", () => ({ createOpenRouter: mocks.createOpenRouter }));
vi.mock("./reviewer.js", () => ({ createPullRequestReviewer: mocks.createPullRequestReviewer }));

const request = pullRequestReviewRequestSchema.parse({
  repository: "Brave10XDevs/MycoHubAI",
  pullRequestNumber: 42,
  baseSha: "a".repeat(40),
  headSha: "b".repeat(40),
  title: "Add review contract",
  body: null,
  changedFiles: [{ path: "src/example.ts", changeType: "modified" }],
  patch: "+const covered = true;",
  retry: false,
});

describe("generatePullRequestReview", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.createOpenRouter.mockReturnValue(vi.fn(() => ({ id: "configured-model" })));
    mocks.createPullRequestReviewer.mockReturnValue({ generate: mocks.generate });
    mocks.generate.mockResolvedValue({ reviewedCommitSha: request.headSha, criteria: {}, findings: [] });
  });

  it("validates configuration lazily and supplies the request and explicit repository root", async () => {
    const { generatePullRequestReview } = await import("./generate.js");

    await generatePullRequestReview(
      request,
      { OPENROUTER_API_KEY: " secret ", OPENROUTER_MODEL: " openai/test " },
      "C:/target/MycoHubAI",
    );

    expect(mocks.createOpenRouter).toHaveBeenCalledWith({ apiKey: "secret" });
    expect(mocks.createPullRequestReviewer).toHaveBeenCalledWith({ id: "configured-model" });
    expect(mocks.generate).toHaveBeenCalledWith({ request, repositoryRoot: "C:/target/MycoHubAI" });
  });

  it("rejects missing credentials before constructing a provider and propagates generation failures", async () => {
    const { generatePullRequestReview } = await import("./generate.js");

    await expect(generatePullRequestReview(request, {})).rejects.toThrow("OPENROUTER_API_KEY is required");
    expect(mocks.createOpenRouter).not.toHaveBeenCalled();

    mocks.generate.mockRejectedValueOnce(new Error("provider unavailable"));
    await expect(generatePullRequestReview(request, { OPENROUTER_API_KEY: "secret" })).rejects.toThrow(
      "provider unavailable",
    );
  });
});
