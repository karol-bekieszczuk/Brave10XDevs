import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { readEnvironment } from "../config/environment.js";
import { createPullRequestReviewer } from "./reviewer.js";
import type { PullRequestReviewRequest, PullRequestReviewResult } from "./schema.js";

export async function generatePullRequestReview(
  request: PullRequestReviewRequest,
  environment: Record<string, string | undefined> = process.env,
  repositoryRoot = process.cwd(),
): Promise<PullRequestReviewResult> {
  const config = readEnvironment(environment);
  const openrouter = createOpenRouter({ apiKey: config.OPENROUTER_API_KEY });

  return createPullRequestReviewer(openrouter(config.OPENROUTER_MODEL)).generate({ request, repositoryRoot });
}
