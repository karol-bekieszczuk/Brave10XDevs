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

  let message: string;

  if (error instanceof Error) {
    message = `${error.name}: ${error.message}`;
    console.error("[diagnosis] raw error", message);
    console.error("[diagnosis] stack", error.stack);
  } else {
    try {
      message = JSON.stringify(error, null, 2);
    } catch {
      message = String(error);
    }

    console.error("[diagnosis] raw non-error", message);
  }

  return new DiagnosisError("provider_failed", "Diagnosis generation failed.");
}
