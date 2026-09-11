import { describe, expect, it } from "vitest";
import { PULL_REQUEST_COMMENT_MARKER, renderPullRequestComment } from "./comment.js";

const result = {
  reviewedCommitSha: "b".repeat(40),
  criteria: {
    documentation: {
      score: 8,
      rationale: "Public behavior is documented.",
      evidence: [{ filePath: "src/example.ts", line: 12, description: "API contract was updated." }],
    },
    testCoverage: {
      score: 7,
      rationale: "Main paths are covered.",
      evidence: [{ filePath: "src/example.test.ts", description: "Covers the failure path." }],
    },
    testQuality: {
      score: 6,
      rationale: "Tests are deterministic.",
      evidence: [{ filePath: "src/example.test.ts", line: 40, description: "Uses injected boundaries." }],
    },
  },
  findings: [{ severity: "warning" as const, filePath: "<untrusted>", message: "<b>" }],
};
describe("PR comments", () => {
  it.each(["passed", "failed"] as const)("renders a stable marked %s outcome", (status) => {
    const comment = renderPullRequestComment({ status, result });
    expect(comment).toContain(PULL_REQUEST_COMMENT_MARKER);
    expect(comment.split(PULL_REQUEST_COMMENT_MARKER)).toHaveLength(2);
    expect(comment).toContain(result.reviewedCommitSha);
    expect(comment).toContain("Average:");
    expect(comment).toContain("### Criterion evidence");
    expect(comment).toContain("#### Documentation — 8/10");
    expect(comment).toContain("Rationale: Public behavior is documented.");
    expect(comment).toContain("`src/example.ts:12` — API contract was updated.");
    expect(comment).toContain("Rationale: Main paths are covered.");
    expect(comment).toContain("`src/example.test.ts` — Covers the failure path.");
    expect(comment).toContain("Rationale: Tests are deterministic.");
    expect(comment).toContain("`src/example.test.ts:40` — Uses injected boundaries.");
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
    expect(comment.split(PULL_REQUEST_COMMENT_MARKER)).toHaveLength(2);
    expect(comment).toContain("HTTP status: 401");
    expect(comment).toContain("Reviewed head:");
    expect(comment).toContain("actions/runs/123");
    expect(comment).toContain("Re-add `ai-cr:review` to retry.");
  });
});
