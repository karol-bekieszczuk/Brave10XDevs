import { describe, expect, it } from "vitest";
import { evaluatePullRequestReview } from "./policy.js";
import { pullRequestReviewResultSchema } from "./schema.js";

const reviewedCommitSha = "b".repeat(40);

function review(scores: [number, number, number], severity?: "error" | "warning" | "suggestion") {
  const criterion = (score: number) => ({
    score,
    rationale: "Rationale",
    evidence: [{ filePath: "src/example.ts", description: "Repository evidence." }],
  });
  return pullRequestReviewResultSchema.parse({
    reviewedCommitSha,
    criteria: {
      documentation: criterion(scores[0]),
      testCoverage: criterion(scores[1]),
      testQuality: criterion(scores[2]),
    },
    findings: severity ? [{ severity, filePath: "src/example.ts", message: "Actionable finding." }] : [],
  });
}

describe("pull request verdict policy", () => {
  it("passes at an average of seven when every score meets the floor", () => {
    expect(evaluatePullRequestReview(review([5, 6, 10]))).toEqual({ verdict: "passed", averageScore: 7 });
  });

  it("fails below the average threshold", () => {
    expect(evaluatePullRequestReview(review([6, 7, 7])).verdict).toBe("failed");
  });

  it("fails when one criterion is below five despite a passing average", () => {
    expect(evaluatePullRequestReview(review([4, 9, 10]))).toEqual({
      verdict: "failed",
      averageScore: 23 / 3,
    });
  });

  it("lets warnings and suggestions pass but lets an error finding override the scores", () => {
    expect(evaluatePullRequestReview(review([10, 10, 10], "warning")).verdict).toBe("passed");
    expect(evaluatePullRequestReview(review([10, 10, 10], "suggestion")).verdict).toBe("passed");
    expect(evaluatePullRequestReview(review([10, 10, 10], "error")).verdict).toBe("failed");
  });
});
