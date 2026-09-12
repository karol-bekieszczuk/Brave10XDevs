import { describe, expect, it, vi } from "vitest";

describe("public barrel", () => {
  it("imports without provider credentials and exposes the supported named contracts", async () => {
    vi.resetModules();
    vi.stubEnv("OPENROUTER_API_KEY", "");

    const api = await import("./index.js");

    expect(typeof api.createReviewer).toBe("function");
    expect(typeof api.generateResponse).toBe("function");
    expect(typeof api.readEnvironment).toBe("function");
    expect(typeof api.reviewer.generate).toBe("function");
    expect(typeof api.createPullRequestReviewer).toBe("function");
    expect(typeof api.buildPullRequestReviewPrompt).toBe("function");
    expect(typeof api.PULL_REQUEST_REVIEWER_INSTRUCTIONS).toBe("string");
    expect(typeof api.evaluatePullRequestReview).toBe("function");
    expect(typeof api.pullRequestChangedFileSchema.parse).toBe("function");
    expect(typeof api.pullRequestReviewRequestSchema.parse).toBe("function");
    expect(typeof api.pullRequestReviewFindingSchema.parse).toBe("function");
    expect(typeof api.pullRequestReviewResultSchema.parse).toBe("function");
    expect(typeof api.CODE_REVIEWER_INSTRUCTIONS).toBe("string");
    expect(typeof api.DEFAULT_REVIEW_REQUEST).toBe("string");
    expect(api.codeReviewResultSchema.parse({ findings: [] })).toEqual({ findings: [] });

    vi.unstubAllEnvs();
  });
});
