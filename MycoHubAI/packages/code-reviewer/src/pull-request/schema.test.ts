import { describe, expect, it } from "vitest";
import {
  MAX_PULL_REQUEST_BODY_CHARACTERS,
  MAX_PULL_REQUEST_PATCH_BYTES,
  PULL_REQUEST_BODY_TRUNCATION_MARKER,
  normalizeProviderPullRequestReviewResult,
  providerPullRequestReviewResultSchema,
  pullRequestReviewRequestSchema,
  pullRequestReviewResultSchema,
} from "./schema.js";

const baseSha = "a".repeat(40);
const headSha = "b".repeat(40);

function request(overrides: Record<string, unknown> = {}) {
  return {
    repository: "Brave10XDevs/MycoHubAI",
    pullRequestNumber: 42,
    baseSha,
    headSha,
    title: "Add pull request review",
    body: null,
    changedFiles: [{ path: "src/example.ts", changeType: "modified" }],
    patch: "diff --git a/src/example.ts b/src/example.ts",
    retry: false,
    ...overrides,
  };
}

function criterion(score = 7) {
  return {
    score,
    rationale: "The changed behavior is covered.",
    evidence: [{ filePath: "src/example.ts", line: 2, description: "The test asserts the public result." }],
  };
}

function result(overrides: Record<string, unknown> = {}) {
  return {
    reviewedCommitSha: headSha,
    criteria: {
      documentation: criterion(),
      testCoverage: criterion(),
      testQuality: criterion(),
    },
    findings: [],
    ...overrides,
  };
}

describe("pull request review request schema", () => {
  it("requires strict repository, PR, commit, manifest, patch, and retry fields", () => {
    expect(pullRequestReviewRequestSchema.parse(request())).toMatchObject({
      repository: "Brave10XDevs/MycoHubAI",
      pullRequestNumber: 42,
      body: "",
      changedFiles: [
        {
          path: "src/example.ts",
          changeType: "modified",
          binary: false,
          submodule: false,
        },
      ],
    });
    expect(pullRequestReviewRequestSchema.safeParse(request({ extra: true })).success).toBe(false);
    expect(pullRequestReviewRequestSchema.safeParse(request({ repository: "MycoHubAI" })).success).toBe(false);
    expect(pullRequestReviewRequestSchema.safeParse(request({ headSha: "not-a-sha" })).success).toBe(false);
    expect(pullRequestReviewRequestSchema.safeParse(request({ changedFiles: [] })).success).toBe(false);
  });

  it("preserves an 8,000-character body and marks longer bodies within the same bound", () => {
    const boundary = "🍄".repeat(MAX_PULL_REQUEST_BODY_CHARACTERS);
    expect(pullRequestReviewRequestSchema.parse(request({ body: boundary })).body).toBe(boundary);

    const truncated = pullRequestReviewRequestSchema.parse(request({ body: `${boundary}x` })).body;
    expect(Array.from(truncated)).toHaveLength(MAX_PULL_REQUEST_BODY_CHARACTERS);
    expect(truncated.endsWith(PULL_REQUEST_BODY_TRUNCATION_MARKER)).toBe(true);
  });

  it("measures the 100 KiB patch limit in UTF-8 bytes", () => {
    const atLimit = "é".repeat(MAX_PULL_REQUEST_PATCH_BYTES / 2);
    expect(pullRequestReviewRequestSchema.safeParse(request({ patch: atLimit })).success).toBe(true);
    expect(pullRequestReviewRequestSchema.safeParse(request({ patch: `${atLimit}é` })).success).toBe(false);
  });
});

describe("pull request review result schemas", () => {
  it.each([1, 5, 7, 10])("accepts the integer score boundary %i", (score) => {
    expect(
      pullRequestReviewResultSchema.safeParse(
        result({
          criteria: {
            documentation: criterion(score),
            testCoverage: criterion(score),
            testQuality: criterion(score),
          },
        }),
      ).success,
    ).toBe(true);
  });

  it.each([0, 11, 1.5])("rejects the invalid score %s", (score) => {
    expect(
      pullRequestReviewResultSchema.safeParse(
        result({
          criteria: {
            documentation: criterion(score),
            testCoverage: criterion(),
            testQuality: criterion(),
          },
        }),
      ).success,
    ).toBe(false);
  });

  it("requires exactly the three approved criteria and rejects undeclared fields", () => {
    const valid = result();
    expect(pullRequestReviewResultSchema.safeParse(valid).success).toBe(true);
    expect(
      pullRequestReviewResultSchema.safeParse({
        ...valid,
        criteria: { ...(valid.criteria as object), architecturalFit: criterion() },
      }).success,
    ).toBe(false);
    expect(pullRequestReviewResultSchema.safeParse({ ...valid, verdict: "passed" }).success).toBe(false);

    const { testQuality: _testQuality, ...missingCriterion } = valid.criteria as Record<string, unknown>;
    expect(pullRequestReviewResultSchema.safeParse({ ...valid, criteria: missingCriterion }).success).toBe(false);
  });

  it("normalizes provider-required nullable evidence and finding fields", () => {
    const providerCriterion = {
      score: 8,
      rationale: "Evidence supports the score.",
      evidence: [{ filePath: "src/example.ts", line: null, description: "A repository-level observation." }],
    };
    const providerResult = providerPullRequestReviewResultSchema.parse({
      reviewedCommitSha: headSha,
      criteria: {
        documentation: providerCriterion,
        testCoverage: providerCriterion,
        testQuality: providerCriterion,
      },
      findings: [
        {
          severity: "warning",
          filePath: "src/example.ts",
          line: null,
          message: "A concrete risk remains.",
          suggestion: null,
        },
      ],
    });

    expect(normalizeProviderPullRequestReviewResult(providerResult)).toEqual({
      reviewedCommitSha: headSha,
      criteria: {
        documentation: { ...providerCriterion, evidence: [{ ...providerCriterion.evidence[0], line: undefined }] },
        testCoverage: { ...providerCriterion, evidence: [{ ...providerCriterion.evidence[0], line: undefined }] },
        testQuality: { ...providerCriterion, evidence: [{ ...providerCriterion.evidence[0], line: undefined }] },
      },
      findings: [
        {
          severity: "warning",
          filePath: "src/example.ts",
          message: "A concrete risk remains.",
        },
      ],
    });
  });

  it("bounds evidence and actionable findings", () => {
    const evidence = { filePath: "src/example.ts", description: "Observed behavior." };
    expect(
      pullRequestReviewResultSchema.safeParse({
        ...result(),
        criteria: {
          documentation: { ...criterion(), evidence: Array.from({ length: 11 }, () => evidence) },
          testCoverage: criterion(),
          testQuality: criterion(),
        },
      }).success,
    ).toBe(false);

    const finding = { severity: "suggestion", filePath: "src/example.ts", message: "Improve this branch." };
    expect(
      pullRequestReviewResultSchema.safeParse({ ...result(), findings: Array.from({ length: 21 }, () => finding) })
        .success,
    ).toBe(false);
  });
});
