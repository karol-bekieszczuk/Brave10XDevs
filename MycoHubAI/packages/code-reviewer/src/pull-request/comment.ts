import {
  evaluatePullRequestReview,
  MINIMUM_CRITERION_SCORE,
  PASSING_AVERAGE_SCORE,
  type PullRequestReviewDecision,
} from "./policy.js";
import type { PullRequestReviewResult } from "./schema.js";

export const PULL_REQUEST_COMMENT_MARKER = "<!-- mycohub-ai-pr-review -->";
export type PullRequestCommentStatus = PullRequestReviewDecision["verdict"] | "error";

function text(value: string): string {
  return value.replace(/[<>]/gu, (character) => (character === "<" ? "&lt;" : "&gt;"));
}
function redact(value: string): string {
  return value.replace(/(?:token|secret|authorization)\s*[:=]\s*\S+/giu, "[redacted]");
}

export function renderPullRequestComment(input: {
  status: PullRequestCommentStatus;
  result?: PullRequestReviewResult;
  errorCategory?: string;
  changedFileCount?: number;
}): string {
  const { status, result, errorCategory, changedFileCount } = input;
  const heading =
    status === "passed" ? "Passed (advisory)" : status === "failed" ? "Needs attention (advisory)" : "Automation error";
  const lines = [PULL_REQUEST_COMMENT_MARKER, `## AI PR review: ${heading}`];
  if (!result)
    return [
      ...lines,
      "",
      `The review could not complete: ${text(redact(errorCategory ?? "operational failure"))}.`,
      "Re-add `ai-cr:review` to retry.",
    ].join("\n");
  const decision = evaluatePullRequestReview(result);
  lines.push(
    "",
    `Reviewed commit: \`${result.reviewedCommitSha}\``,
    `Changed files: ${changedFileCount ?? "unknown"}`,
    "",
    "| Criterion | Score |",
    "| --- | ---: |",
  );
  lines.push(
    `| Documentation | ${result.criteria.documentation.score}/10 |`,
    `| Test coverage | ${result.criteria.testCoverage.score}/10 |`,
    `| Test quality and reliability | ${result.criteria.testQuality.score}/10 |`,
  );
  lines.push(
    "",
    `Average: ${decision.averageScore.toFixed(2)}/10 (pass: average >= ${PASSING_AVERAGE_SCORE}, each criterion >= ${MINIMUM_CRITERION_SCORE}, and no error finding).`,
  );
  lines.push("", "### Findings");
  if (result.findings.length === 0) lines.push("No actionable findings.");
  for (const finding of result.findings)
    lines.push(
      `- **${finding.severity}** \`${text(finding.filePath)}${finding.line ? `:${finding.line}` : ""}\`: ${text(finding.message)}`,
    );
  lines.push("", "This review is advisory. Re-add `ai-cr:review` to request a new review.");
  return lines.join("\n");
}
