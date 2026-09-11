import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { readEnvironment } from "../config/environment.js";
import { createPullRequestReviewer } from "./reviewer.js";
import type { PullRequestReviewRequest, PullRequestReviewResult } from "./schema.js";
import { OperationalError } from "./operational-error.js";

export async function generatePullRequestReview(
  request: PullRequestReviewRequest,
  environment: Record<string, string | undefined> = process.env,
  repositoryRoot = process.cwd(),
): Promise<PullRequestReviewResult> {
  let config: ReturnType<typeof readEnvironment>;
  try {
    config = readEnvironment(environment);
  } catch (cause) {
    throw new OperationalError(
      { code: "PROVIDER_AUTH_FAILED", stage: "provider-request" },
      { cause, internalMessage: "OPENROUTER_API_KEY is required." },
    );
  }
  const openrouter = createOpenRouter({ apiKey: config.OPENROUTER_API_KEY });

  return createPullRequestReviewer(openrouter(config.OPENROUTER_MODEL)).generate({ request, repositoryRoot });
}
