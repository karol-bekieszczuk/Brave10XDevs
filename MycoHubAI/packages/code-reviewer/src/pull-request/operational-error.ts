import { APICallError, NoOutputGeneratedError, RetryError } from "ai";

export type OperationalFailureCode =
  | "INPUT_EVENT_INVALID"
  | "DIFF_ACQUISITION_FAILED"
  | "DIFF_EMPTY"
  | "DIFF_TOO_LARGE"
  | "PROVIDER_AUTH_FAILED"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REQUEST_FAILED"
  | "MODEL_OUTPUT_INVALID"
  | "REVIEW_SHA_MISMATCH"
  | "GITHUB_PERMISSION_DENIED"
  | "GITHUB_RATE_LIMITED"
  | "GITHUB_API_FAILED"
  | "INTERNAL_ERROR";

export type OperationalFailureStage =
  | "input-validation"
  | "diff-acquisition"
  | "provider-request"
  | "provider-response-validation"
  | "github-publication"
  | "orchestration";

export interface OperationalFailure {
  code: OperationalFailureCode;
  stage: OperationalFailureStage;
  httpStatus?: number;
  attempts?: number;
  actualBytes?: number;
  limitBytes?: number;
  operation?: "read-head" | "find-comment" | "create-comment" | "update-comment" | "reconcile-labels";
}

export const OPERATIONAL_FAILURE_SUMMARIES: Record<OperationalFailureCode, string> = {
  INPUT_EVENT_INVALID: "The pull request event did not match the required input contract.",
  DIFF_ACQUISITION_FAILED: "Git could not build the pull request diff.",
  DIFF_EMPTY: "The pull request diff is empty.",
  DIFF_TOO_LARGE: "The pull request diff exceeds the supported size limit.",
  PROVIDER_AUTH_FAILED: "The AI provider rejected its credential or authentication configuration.",
  PROVIDER_RATE_LIMITED: "The AI provider rate limit was reached.",
  PROVIDER_TIMEOUT: "The AI provider request timed out.",
  PROVIDER_UNAVAILABLE: "The AI provider is temporarily unavailable.",
  PROVIDER_REQUEST_FAILED: "The AI provider rejected the review request.",
  MODEL_OUTPUT_INVALID: "The provider response did not match the required review schema.",
  REVIEW_SHA_MISMATCH: "The generated review did not identify the requested head commit.",
  GITHUB_PERMISSION_DENIED: "GitHub rejected an operation because the workflow lacks permission.",
  GITHUB_RATE_LIMITED: "The GitHub API rate limit was reached.",
  GITHUB_API_FAILED: "A GitHub API operation failed.",
  INTERNAL_ERROR: "The reviewer encountered an unclassified internal error.",
};

export class OperationalError extends Error {
  constructor(
    readonly publicFailure: OperationalFailure,
    options?: ErrorOptions & { internalMessage?: string },
  ) {
    super(options?.internalMessage ?? publicFailure.code, { cause: options?.cause });
    this.name = "OperationalError";
  }
}

function apiCallFailure(error: unknown): OperationalFailure | undefined {
  if (!APICallError.isInstance(error)) return undefined;
  const httpStatus = error.statusCode;
  const common = { stage: "provider-request" as const, ...(httpStatus === undefined ? {} : { httpStatus }) };
  if (httpStatus === 401 || httpStatus === 403) return { code: "PROVIDER_AUTH_FAILED", ...common };
  if (httpStatus === 408) return { code: "PROVIDER_TIMEOUT", ...common };
  if (httpStatus === 429) return { code: "PROVIDER_RATE_LIMITED", ...common };
  if (httpStatus !== undefined && httpStatus >= 500) return { code: "PROVIDER_UNAVAILABLE", ...common };
  return { code: "PROVIDER_REQUEST_FAILED", ...common };
}

export function toOperationalFailure(error: unknown): OperationalFailure {
  if (error instanceof OperationalError) return error.publicFailure;

  if (RetryError.isInstance(error)) {
    const failure = apiCallFailure(error.lastError);
    if (failure) return { ...failure, attempts: error.errors.length };
  }

  const providerFailure = apiCallFailure(error);
  if (providerFailure) return providerFailure;

  if (NoOutputGeneratedError.isInstance(error)) {
    const causeFailure = apiCallFailure(error.cause);
    return (
      causeFailure ?? {
        code: "MODEL_OUTPUT_INVALID",
        stage: "provider-response-validation",
        attempts: 3,
      }
    );
  }

  return { code: "INTERNAL_ERROR", stage: "orchestration" };
}
