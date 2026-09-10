import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createReviewer } from "./agent/reviewer.js";
import { readEnvironment } from "./config/environment.js";
import type { CodeReviewResult } from "./schemas/code-review.js";

export async function generateResponse(
  prompt: string,
  environment: Record<string, string | undefined> = process.env,
  repositoryRoot = process.cwd(),
): Promise<CodeReviewResult> {
  const config = readEnvironment(environment);
  const openrouter = createOpenRouter({ apiKey: config.OPENROUTER_API_KEY });

  return createReviewer(openrouter(config.OPENROUTER_MODEL)).generate({ prompt, repositoryRoot });
}
