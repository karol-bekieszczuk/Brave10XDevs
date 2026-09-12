import { describe, expect, it } from "vitest";
import { pullRequestReviewResultSchema, type PullRequestReviewResult } from "../src/index.js";
import { gradeReactMigrationReview, REACT_MIGRATION_COMPONENT_PATH, REACT_MIGRATION_HEAD_SHA } from "./assertions.js";

function review(overrides: Partial<PullRequestReviewResult> = {}): PullRequestReviewResult {
  const criterion = (score: number) => ({
    score,
    rationale: "The fixture provides relevant behavioral evidence.",
    evidence: [{ filePath: REACT_MIGRATION_COMPONENT_PATH, description: "Behavior contract evidence." }],
  });

  return pullRequestReviewResultSchema.parse({
    reviewedCommitSha: REACT_MIGRATION_HEAD_SHA,
    criteria: {
      documentation: criterion(10),
      testCoverage: criterion(10),
      testQuality: criterion(10),
    },
    findings: [
      {
        severity: "error",
        filePath: REACT_MIGRATION_COMPONENT_PATH,
        line: 25,
        message: "The profile synchronization effect captures only the initial profile.",
        suggestion: "Depend on profile and reset the draft when it changes.",
      },
    ],
    ...overrides,
  });
}

function grade(output: string) {
  return gradeReactMigrationReview(output, {} as never);
}

describe("React migration deterministic assertion", () => {
  it("rejects malformed JSON", () => {
    expect(grade("not-json")).toMatchObject({ pass: false, reason: "Output is not valid JSON." });
  });

  it("rejects schema-invalid output", () => {
    expect(grade(JSON.stringify({ reviewedCommitSha: REACT_MIGRATION_HEAD_SHA }))).toMatchObject({
      pass: false,
      reason: "Output does not satisfy the pull-request review result schema.",
    });
  });

  it("rejects a review of the wrong head commit", () => {
    expect(grade(JSON.stringify(review({ reviewedCommitSha: "3".repeat(40) })))).toMatchObject({
      pass: false,
      reason: "Review does not identify the fixture head commit.",
    });
  });

  it("rejects findings outside the migrated component", () => {
    const result = review({
      findings: [
        {
          severity: "error",
          filePath: "src/Unrelated.tsx",
          message: "Unrelated finding.",
        },
      ],
    });

    expect(grade(JSON.stringify(result))).toMatchObject({
      pass: false,
      reason: "Review contains a finding outside the allowed fixture component.",
    });
  });

  it("rejects a deterministic failure that has no component error", () => {
    const lowCriterion = {
      score: 1,
      rationale: "Coverage is insufficient.",
      evidence: [{ filePath: REACT_MIGRATION_COMPONENT_PATH, description: "Missing coverage." }],
    };
    const result = review({
      criteria: {
        documentation: lowCriterion,
        testCoverage: lowCriterion,
        testQuality: lowCriterion,
      },
      findings: [
        {
          severity: "warning",
          filePath: REACT_MIGRATION_COMPONENT_PATH,
          message: "Potential issue.",
        },
      ],
    });

    expect(grade(JSON.stringify(result))).toMatchObject({
      pass: false,
      reason: "Review must report at least one error on the migrated component.",
    });
  });

  it("rejects a review that production policy passes", () => {
    const result = review({
      findings: [
        {
          severity: "warning",
          filePath: REACT_MIGRATION_COMPONENT_PATH,
          message: "Potential issue.",
        },
      ],
    });

    expect(grade(JSON.stringify(result))).toMatchObject({
      pass: false,
      reason: "Production review policy did not produce the required failed verdict.",
    });
  });

  it("accepts a schema-valid review with a component error and deterministic failed verdict", () => {
    expect(grade(JSON.stringify(review()))).toEqual({
      pass: true,
      score: 1,
      reason: "Review is schema-valid, targets the fixture head and component, and fails production policy.",
    });
  });
});
