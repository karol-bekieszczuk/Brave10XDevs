import { describe, expect, it } from "vitest";
import {
  diagnosisApiResponseSchema,
  diagnosisRequestSchema,
  diagnosisResponseSchema,
  diagnosisScopeStatusSchema,
} from "./schema";

const validDiagnosis = {
  scopeStatus: "mixed_scope",
  possibleCauses: ["Agar growth may be uneven because the plate is still recovering."],
  suggestedActions: ["Compare the leading edge over the next logged observation."],
  confidenceBand: "low",
  uncertainty: "The selected log does not include enough timing detail for a firm call.",
  followUpQuestion: "When did the slower growth first appear in this selected log?",
  sources: [{ sourcePath: "lib/diagnosis/knowledge/agar.md", sourceHeading: "Slow growth" }],
};

describe("diagnosis schemas", () => {
  it("accepts all F-03 scope outcome categories", () => {
    expect(diagnosisScopeStatusSchema.options).toEqual(["in_scope", "missing_context", "mixed_scope", "out_of_scope"]);
  });

  it("accepts a structured diagnosis response with mixed_scope", () => {
    expect(diagnosisResponseSchema.parse(validDiagnosis)).toEqual(validDiagnosis);
  });

  it("rejects unsupported scopeStatus values", () => {
    const result = diagnosisResponseSchema.safeParse({
      ...validDiagnosis,
      scopeStatus: "fruiting_scope",
    });

    expect(result.success).toBe(false);
  });

  it("trims and validates diagnosis requests", () => {
    expect(
      diagnosisRequestSchema.parse({
        growLogId: " log-1 ",
        question: " Is this agar plate stalling? ",
      }),
    ).toEqual({
      growLogId: "log-1",
      question: "Is this agar plate stalling?",
    });
  });

  it("rejects blank request fields", () => {
    const result = diagnosisRequestSchema.safeParse({
      growLogId: " ",
      question: "",
    });

    expect(result.success).toBe(false);
  });

  it("validates success and controlled error API responses", () => {
    expect(
      diagnosisApiResponseSchema.parse({
        ok: true,
        diagnosis: validDiagnosis,
      }),
    ).toEqual({
      ok: true,
      diagnosis: validDiagnosis,
    });

    expect(
      diagnosisApiResponseSchema.parse({
        ok: false,
        error: {
          code: "provider_failed",
          message: "The model provider failed.",
          retryable: true,
        },
      }),
    ).toEqual({
      ok: false,
      error: {
        code: "provider_failed",
        message: "The model provider failed.",
        retryable: true,
      },
    });
  });
});
