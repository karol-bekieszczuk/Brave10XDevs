import { APICallError, NoOutputGeneratedError, RetryError } from "ai";
import { describe, expect, it } from "vitest";
import { toOperationalFailure } from "./operational-error.js";

function apiError(statusCode: number) {
  return new APICallError({
    message: 'Bearer top-secret token=also-secret {"apiKey":"third-secret"}',
    url: "https://openrouter.ai/api/v1/chat/completions",
    requestBodyValues: { apiKey: "fourth-secret" },
    responseBody: '{"credential":"fifth-secret"}',
    statusCode,
  });
}

describe("operational failure classification", () => {
  it.each([
    [401, "PROVIDER_AUTH_FAILED"],
    [408, "PROVIDER_TIMEOUT"],
    [429, "PROVIDER_RATE_LIMITED"],
    [503, "PROVIDER_UNAVAILABLE"],
    [400, "PROVIDER_REQUEST_FAILED"],
  ] as const)("maps provider HTTP %s without copying provider payloads", (statusCode, code) => {
    expect(toOperationalFailure(apiError(statusCode))).toEqual({
      code,
      stage: "provider-request",
      httpStatus: statusCode,
    });
  });

  it("reports exhausted provider attempts without exposing the wrapped errors", () => {
    const error = new RetryError({
      reason: "maxRetriesExceeded",
      message: "unsafe",
      errors: [apiError(503), apiError(503)],
    });
    expect(toOperationalFailure(error)).toEqual({
      code: "PROVIDER_UNAVAILABLE",
      stage: "provider-request",
      httpStatus: 503,
      attempts: 2,
    });
  });

  it("distinguishes invalid structured output from an unknown exception", () => {
    expect(toOperationalFailure(new NoOutputGeneratedError())).toEqual({
      code: "MODEL_OUTPUT_INVALID",
      stage: "provider-response-validation",
      attempts: 3,
    });
    expect(toOperationalFailure(new Error("apiKey=must-not-escape"))).toEqual({
      code: "INTERNAL_ERROR",
      stage: "orchestration",
    });
  });
});
