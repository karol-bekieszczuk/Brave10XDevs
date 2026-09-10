import { describe, expect, it } from "vitest";
import {
  codeReviewFindingSchema,
  codeReviewResultSchema,
  codeReviewSeveritySchema,
  normalizeProviderCodeReviewResult,
  providerCodeReviewResultSchema,
  type CodeReviewResult,
} from "./code-review.js";

const validFinding = {
  severity: "warning" as const,
  filePath: "src/example.ts",
  line: 12,
  message: "The fallback hides a failed operation.",
  suggestion: "Return the error to the caller.",
};

describe("code review schemas", () => {
  it.each(["error", "warning", "suggestion"])("accepts the %s severity", (severity) => {
    expect(codeReviewSeveritySchema.parse(severity)).toBe(severity);
  });

  it("rejects unknown severities", () => {
    expect(codeReviewSeveritySchema.safeParse("info").success).toBe(false);
  });

  it("accepts required finding fields and both optional fields", () => {
    expect(
      codeReviewFindingSchema.parse({
        severity: "error",
        filePath: "src/minimal.ts",
        message: "This branch always throws.",
      }),
    ).toEqual({
      severity: "error",
      filePath: "src/minimal.ts",
      message: "This branch always throws.",
    });
    expect(codeReviewFindingSchema.parse(validFinding)).toEqual(validFinding);
  });

  it("requires severity, filePath, and message", () => {
    const { severity: _severity, ...withoutSeverity } = validFinding;
    const { filePath: _filePath, ...withoutFilePath } = validFinding;
    const { message: _message, ...withoutMessage } = validFinding;

    expect(codeReviewFindingSchema.safeParse(withoutSeverity).success).toBe(false);
    expect(codeReviewFindingSchema.safeParse(withoutFilePath).success).toBe(false);
    expect(codeReviewFindingSchema.safeParse(withoutMessage).success).toBe(false);
  });

  it("requires a positive integer line", () => {
    expect(codeReviewFindingSchema.safeParse({ ...validFinding, line: 0 }).success).toBe(false);
    expect(codeReviewFindingSchema.safeParse({ ...validFinding, line: 1.5 }).success).toBe(false);
  });

  it("enforces text limits and rejects undeclared fields", () => {
    expect(codeReviewFindingSchema.safeParse({ ...validFinding, filePath: "p".repeat(500) }).success).toBe(true);
    expect(codeReviewFindingSchema.safeParse({ ...validFinding, filePath: "p".repeat(501) }).success).toBe(false);
    expect(codeReviewFindingSchema.safeParse({ ...validFinding, message: "m".repeat(1_000) }).success).toBe(true);
    expect(codeReviewFindingSchema.safeParse({ ...validFinding, message: "m".repeat(1_001) }).success).toBe(false);
    expect(codeReviewFindingSchema.safeParse({ ...validFinding, suggestion: "s".repeat(1_000) }).success).toBe(true);
    expect(codeReviewFindingSchema.safeParse({ ...validFinding, suggestion: "s".repeat(1_001) }).success).toBe(false);
    expect(codeReviewFindingSchema.safeParse({ ...validFinding, verdict: "reject" }).success).toBe(false);
  });

  it("uses an empty findings array as the clean-review result", () => {
    const result: CodeReviewResult = codeReviewResultSchema.parse({ findings: [] });
    expect(result).toEqual({ findings: [] });
  });

  it("accepts 20 findings and rejects 21", () => {
    expect(codeReviewResultSchema.safeParse({ findings: Array.from({ length: 20 }, () => validFinding) }).success).toBe(
      true,
    );
    expect(codeReviewResultSchema.safeParse({ findings: Array.from({ length: 21 }, () => validFinding) }).success).toBe(
      false,
    );
  });

  it("rejects root fields other than findings", () => {
    expect(codeReviewResultSchema.safeParse({ findings: [], summary: "Looks good" }).success).toBe(false);
  });

  it("normalizes provider-required nullable fields to the public optional contract", () => {
    const providerResult = providerCodeReviewResultSchema.parse({
      findings: [
        {
          severity: "warning",
          filePath: "src/example.ts",
          line: null,
          message: "The fallback hides a failed operation.",
          suggestion: null,
        },
      ],
    });

    expect(normalizeProviderCodeReviewResult(providerResult)).toEqual({
      findings: [
        {
          severity: "warning",
          filePath: "src/example.ts",
          message: "The fallback hides a failed operation.",
        },
      ],
    });
  });
});
