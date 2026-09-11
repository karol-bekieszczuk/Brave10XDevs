import { pullRequestReviewResultSchema, type PullRequestReviewResult } from "./schema.js";

export const PASSING_AVERAGE_SCORE = 7;
export const MINIMUM_CRITERION_SCORE = 5;

export type PullRequestReviewVerdict = "passed" | "failed";

export interface PullRequestReviewDecision {
  verdict: PullRequestReviewVerdict;
  averageScore: number;
}

export function evaluatePullRequestReview(result: PullRequestReviewResult): PullRequestReviewDecision {
  const validatedResult = pullRequestReviewResultSchema.parse(result);
  const scores = Object.values(validatedResult.criteria).map(({ score }) => score);
  const averageScore = scores.reduce((total, score) => total + score, 0) / scores.length;
  const meetsScoreThresholds =
    averageScore >= PASSING_AVERAGE_SCORE && scores.every((score) => score >= MINIMUM_CRITERION_SCORE);
  const hasErrorFinding = validatedResult.findings.some(({ severity }) => severity === "error");

  return {
    verdict: meetsScoreThresholds && !hasErrorFinding ? "passed" : "failed",
    averageScore,
  };
}
