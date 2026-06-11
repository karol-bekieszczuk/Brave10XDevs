export type DiagnosisErrorCode =
  | "invalid_request"
  | "unauthorized"
  | "grow_log_not_found"
  | "unsupported_stage"
  | "retrieval_failed"
  | "provider_failed"
  | "provider_timeout"
  | "invalid_model_output";

const retryableCodes = new Set<DiagnosisErrorCode>([
  "retrieval_failed",
  "provider_failed",
  "provider_timeout",
  "invalid_model_output",
]);

export class DiagnosisError extends Error {
  readonly code: DiagnosisErrorCode;
  readonly retryable: boolean;

  constructor(code: DiagnosisErrorCode, message: string, retryable = retryableCodes.has(code)) {
    super(message);
    this.name = "DiagnosisError";
    this.code = code;
    this.retryable = retryable;
  }

  toResponse() {
    return {
      ok: false as const,
      error: {
        code: this.code,
        message: this.message,
        retryable: this.retryable,
      },
    };
  }
}

export function toDiagnosisError(error: unknown) {
  if (error instanceof DiagnosisError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);

  console.error("[diagnosis] raw error", message);

  return new DiagnosisError("provider_failed", `Diagnosis generation failed: ${message}`);
}
