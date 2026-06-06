import { describe, expect, it } from "vitest";
import { DiagnosisError, toDiagnosisError } from "./errors";

describe("diagnosis errors", () => {
  it("serializes controlled non-retryable errors", () => {
    const error = new DiagnosisError("grow_log_not_found", "Grow log was not found.");

    expect(error.toResponse()).toEqual({
      ok: false,
      error: {
        code: "grow_log_not_found",
        message: "Grow log was not found.",
        retryable: false,
      },
    });
  });

  it("marks provider and validation failures as retryable controlled errors", () => {
    expect(new DiagnosisError("provider_timeout", "Provider timed out.").retryable).toBe(true);
    expect(new DiagnosisError("invalid_model_output", "Model output was invalid.").retryable).toBe(true);
  });

  it("wraps unknown failures without exposing original error details", () => {
    const error = toDiagnosisError(new Error("raw provider stack"));

    expect(error.toResponse()).toEqual({
      ok: false,
      error: {
        code: "provider_failed",
        message: "Diagnosis generation failed.",
        retryable: true,
      },
    });
  });
});
