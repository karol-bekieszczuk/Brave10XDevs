import { describe, expect, it } from "vitest";
import { PULL_REQUEST_COMMENT_MARKER, renderPullRequestComment } from "./comment.js";

const result = {
  reviewedCommitSha: "b".repeat(40),
  criteria: {
    documentation: { score: 8, rationale: "r", evidence: [{ filePath: "a.ts", description: "d" }] },
    testCoverage: { score: 7, rationale: "r", evidence: [{ filePath: "a.ts", description: "d" }] },
    testQuality: { score: 6, rationale: "r", evidence: [{ filePath: "a.ts", description: "d" }] },
  },
  findings: [{ severity: "warning" as const, filePath: "<untrusted>", message: "<b>" }],
};
describe("PR comments", () => {
  it.each(["passed", "failed"] as const)("renders a stable marked %s outcome", (status) => {
    const comment = renderPullRequestComment({ status, result });
    expect(comment).toContain(PULL_REQUEST_COMMENT_MARKER);
    expect(comment).toContain(result.reviewedCommitSha);
    expect(comment).toContain("Average:");
    expect(comment).toContain("&lt;untrusted&gt;");
    expect(comment).toContain("Re-add `ai-cr:review` to request a new review.");
  });
  it("renders a redacted operational error and retry guidance", () => {
    const comment = renderPullRequestComment({
      status: "error",
      operationalFailure: { code: "PROVIDER_AUTH_FAILED", stage: "provider-request", httpStatus: 401 },
      headSha: "b".repeat(40),
      runUrl: "https://github.com/Brave10XDevs/MycoHubAI/actions/runs/123",
    });
    expect(comment).toContain("`PROVIDER_AUTH_FAILED`");
    expect(comment).toContain("HTTP status: 401");
    expect(comment).toContain("Reviewed head:");
    expect(comment).toContain("actions/runs/123");
    expect(comment).toContain("Re-add `ai-cr:review` to retry.");
  });
});
