import { describe, expect, it } from "vitest";
import { CODE_REVIEWER_INSTRUCTIONS, DEFAULT_REVIEW_REQUEST } from "./code-review.js";

describe("reviewer prompts", () => {
  it("requires evidence-backed, repository-relative findings without invented lines", () => {
    expect(CODE_REVIEWER_INSTRUCTIONS).toContain("repository evidence");
    expect(CODE_REVIEWER_INSTRUCTIONS).toContain("repository-relative file paths");
    expect(CODE_REVIEWER_INSTRUCTIONS).toContain("Never invent or estimate line numbers");
  });

  it("defines the severity rubric and clean-review representation", () => {
    expect(CODE_REVIEWER_INSTRUCTIONS).toContain("error for behavior that is broken or unsafe");
    expect(CODE_REVIEWER_INSTRUCTIONS).toContain("warning for a concrete risk");
    expect(CODE_REVIEWER_INSTRUCTIONS).toContain("suggestion for a localized improvement");
    expect(CODE_REVIEWER_INSTRUCTIONS).toContain("empty findings array");
  });

  it("reserves the two-step budget for one parallel tool round and structured output", () => {
    expect(CODE_REVIEWER_INSTRUCTIONS).toContain("at most one parallel tool-call round");
    expect(CODE_REVIEWER_INSTRUCTIONS).toContain("second and final step");
    expect(CODE_REVIEWER_INSTRUCTIONS).toContain("structured result");
  });

  it("forbids verdicts, summaries, and undeclared output fields", () => {
    expect(CODE_REVIEWER_INSTRUCTIONS).toContain("Do not add a verdict, summary, score, or undeclared fields");
  });

  it("exports a useful default review request", () => {
    expect(DEFAULT_REVIEW_REQUEST).toContain("Review this repository");
    expect(DEFAULT_REVIEW_REQUEST).toContain("actionable");
  });
});
