import {
  evaluatePullRequestReview,
  MINIMUM_CRITERION_SCORE,
  PASSING_AVERAGE_SCORE,
  type PullRequestReviewDecision,
} from "./policy.js";
import type { PullRequestReviewResult } from "./schema.js";
import { OPERATIONAL_FAILURE_SUMMARIES, type OperationalFailure } from "./operational-error.js";

export const PULL_REQUEST_COMMENT_MARKER = "<!-- mycohub-ai-pr-review -->";
export type PullRequestCommentStatus = PullRequestReviewDecision["verdict"] | "error";

function text(value: string): string {
  return value.replace(/[<>]/gu, (character) => (character === "<" ? "&lt;" : "&gt;"));
}
export function renderPullRequestComment(input: {
  status: PullRequestCommentStatus;
  result?: PullRequestReviewResult;
  operationalFailure?: OperationalFailure;
  changedFileCount?: number;
  headSha?: string;
  runUrl?: string;
}): string {
  const { status, result, operationalFailure, changedFileCount, headSha, runUrl } = input;
  const heading =
    status === "passed" ? "Passed (advisory)" : status === "failed" ? "Needs attention (advisory)" : "Automation error";
  const lines = [PULL_REQUEST_COMMENT_MARKER, `## AI PR review: ${heading}`];
  if (!result) {
    const failure = operationalFailure ?? { code: "INTERNAL_ERROR" as const, stage: "orchestration" as const };
    const details = [
      `Error code: \`${failure.code}\``,
      `Stage: \`${failure.stage}\``,
      `What happened: ${OPERATIONAL_FAILURE_SUMMARIES[failure.code]}`,
      ...(failure.httpStatus === undefined ? [] : [`HTTP status: ${failure.httpStatus}`]),
      ...(failure.attempts === undefined ? [] : [`Attempts: ${failure.attempts}`]),
      ...(failure.actualBytes === undefined ? [] : [`Actual size: ${failure.actualBytes} bytes`]),
      ...(failure.limitBytes === undefined ? [] : [`Supported limit: ${failure.limitBytes} bytes`]),
      ...(failure.operation === undefined ? [] : [`Operation: \`${failure.operation}\``]),
      ...(headSha === undefined ? [] : [`Reviewed head: \`${text(headSha)}\``]),
      ...(changedFileCount === undefined ? [] : [`Changed files: ${changedFileCount}`]),
      ...(runUrl === undefined ? [] : [`Diagnostics: ${text(runUrl)}`]),
    ];
    return [...lines, "", ...details, "Re-add `ai-cr:review` to retry."].join("\n");
  }
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
