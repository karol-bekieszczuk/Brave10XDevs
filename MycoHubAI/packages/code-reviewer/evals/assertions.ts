import type { AssertionValueFunction, GradingResult } from "promptfoo";
import { evaluatePullRequestReview, pullRequestReviewResultSchema } from "../src/index.js";

export const REACT_MIGRATION_HEAD_SHA = "2222222222222222222222222222222222222222";
export const REACT_MIGRATION_COMPONENT_PATH = "src/UserProfileEditor.tsx";

function failed(reason: string): GradingResult {
  return { pass: false, score: 0, reason };
}

export const gradeReactMigrationReview: AssertionValueFunction = (output) => {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(output);
  } catch {
    return failed("Output is not valid JSON.");
  }

  const parsedResult = pullRequestReviewResultSchema.safeParse(parsedJson);
  if (!parsedResult.success) {
    return failed("Output does not satisfy the pull-request review result schema.");
  }

  const result = parsedResult.data;
  if (result.reviewedCommitSha !== REACT_MIGRATION_HEAD_SHA) {
    return failed("Review does not identify the fixture head commit.");
  }

  if (result.findings.some(({ filePath }) => filePath !== REACT_MIGRATION_COMPONENT_PATH)) {
    return failed("Review contains a finding outside the allowed fixture component.");
  }

  if (evaluatePullRequestReview(result).verdict !== "failed") {
    return failed("Production review policy did not produce the required failed verdict.");
  }

  const hasComponentError = result.findings.some(
    ({ filePath, severity }) => filePath === REACT_MIGRATION_COMPONENT_PATH && severity === "error",
  );
  if (!hasComponentError) {
    return failed("Review must report at least one error on the migrated component.");
  }

  return {
    pass: true,
    score: 1,
    reason: "Review is schema-valid, targets the fixture head and component, and fails production policy.",
  };
};

export default gradeReactMigrationReview;
