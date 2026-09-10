import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { isStepCount, Output, ToolLoopAgent, type LanguageModel } from "ai";
import { DEFAULT_OPENROUTER_MODEL } from "../config/environment.js";
import { CODE_REVIEWER_INSTRUCTIONS } from "../prompts/code-review.js";
import {
  normalizeProviderCodeReviewResult,
  providerCodeReviewResultSchema,
  type CodeReviewResult,
} from "../schemas/code-review.js";
import { repositoryTools } from "../tools/repository.js";

export interface Reviewer {
  generate(input: { prompt: string; repositoryRoot: string }): Promise<CodeReviewResult>;
}

function createToolLoopAgent(model: LanguageModel, repositoryRoot: string) {
  return new ToolLoopAgent({
    model,
    instructions: CODE_REVIEWER_INSTRUCTIONS,
    tools: repositoryTools,
    toolsContext: {
      readFile: { repositoryRoot },
      searchText: { repositoryRoot },
    },
    output: Output.object({ schema: providerCodeReviewResultSchema }),
    stopWhen: isStepCount(2),
    maxRetries: 2,
  });
}

class RepositoryScopedReviewer implements Reviewer {
  constructor(private readonly model: LanguageModel) {}

  async generate({ prompt, repositoryRoot }: { prompt: string; repositoryRoot: string }): Promise<CodeReviewResult> {
    const result = await createToolLoopAgent(this.model, repositoryRoot).generate({ prompt });
    return normalizeProviderCodeReviewResult(result.output);
  }
}

export function createReviewer(model: LanguageModel): Reviewer {
  return new RepositoryScopedReviewer(model);
}

const configuredModel = process.env.OPENROUTER_MODEL?.trim();
const openrouter = createOpenRouter();

export const reviewer = createReviewer(openrouter(configuredModel ?? DEFAULT_OPENROUTER_MODEL));
