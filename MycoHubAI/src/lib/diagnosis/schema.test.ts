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

  it("accepts structured output at every response limit", () => {
    const result = diagnosisResponseSchema.safeParse({
      ...validDiagnosis,
      possibleCauses: Array.from({ length: 5 }, () => "c".repeat(500)),
      suggestedActions: Array.from({ length: 5 }, () => "a".repeat(500)),
      uncertainty: "u".repeat(1_000),
      followUpQuestion: "f".repeat(500),
      sources: Array.from({ length: 5 }, () => ({
        sourcePath: "p".repeat(300),
        sourceHeading: "h".repeat(200),
      })),
    });

    expect(result.success).toBe(true);
  });

  it("rejects output one over every response cardinality and text limit", () => {
    const invalidResponses = [
      { ...validDiagnosis, possibleCauses: Array.from({ length: 6 }, () => "cause") },
      { ...validDiagnosis, suggestedActions: Array.from({ length: 6 }, () => "action") },
      { ...validDiagnosis, sources: Array.from({ length: 6 }, () => validDiagnosis.sources[0]) },
      { ...validDiagnosis, possibleCauses: ["c".repeat(501)] },
      { ...validDiagnosis, suggestedActions: ["a".repeat(501)] },
      { ...validDiagnosis, uncertainty: "u".repeat(1_001) },
      { ...validDiagnosis, followUpQuestion: "f".repeat(501) },
      { ...validDiagnosis, sources: [{ ...validDiagnosis.sources[0], sourcePath: "p".repeat(301) }] },
      { ...validDiagnosis, sources: [{ ...validDiagnosis.sources[0], sourceHeading: "h".repeat(201) }] },
    ];

    for (const response of invalidResponses) {
      expect(diagnosisResponseSchema.safeParse(response).success).toBe(false);
    }
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
        growLogId: " 550e8400-e29b-41d4-a716-446655440000 ",
        question: " Is this agar plate stalling? ",
      }),
    ).toEqual({
      growLogId: "550e8400-e29b-41d4-a716-446655440000",
      question: "Is this agar plate stalling?",
    });
  });

  it("rejects malformed grow-log UUIDs", () => {
    const result = diagnosisRequestSchema.safeParse({
      growLogId: "log-1",
      question: "Is this agar plate stalling?",
    });

    expect(result.success).toBe(false);
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
