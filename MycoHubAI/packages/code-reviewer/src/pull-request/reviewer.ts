import { isStepCount, Output, ToolLoopAgent, type LanguageModel } from "ai";
import { repositoryTools } from "../tools/repository.js";
import { buildPullRequestReviewPrompt, PULL_REQUEST_REVIEWER_INSTRUCTIONS } from "./prompt.js";
import {
  normalizeProviderPullRequestReviewResult,
  providerPullRequestReviewResultSchema,
  pullRequestReviewRequestSchema,
  type PullRequestReviewRequest,
  type PullRequestReviewResult,
} from "./schema.js";
import { OperationalError } from "./operational-error.js";

export interface PullRequestReviewer {
  generate(input: { request: PullRequestReviewRequest; repositoryRoot: string }): Promise<PullRequestReviewResult>;
}

function createToolLoopAgent(model: LanguageModel, repositoryRoot: string) {
  return new ToolLoopAgent({
    model,
    instructions: PULL_REQUEST_REVIEWER_INSTRUCTIONS,
    tools: repositoryTools,
    toolsContext: {
      readFile: { repositoryRoot },
      searchText: { repositoryRoot },
    },
    output: Output.object({ schema: providerPullRequestReviewResultSchema }),
    prepareStep: ({ stepNumber }) => (stepNumber === 0 ? undefined : { activeTools: [] }),
    stopWhen: isStepCount(3),
    maxRetries: 2,
  });
}

class RepositoryScopedPullRequestReviewer implements PullRequestReviewer {
  constructor(private readonly model: LanguageModel) {}

  async generate({
    request,
    repositoryRoot,
  }: {
    request: PullRequestReviewRequest;
    repositoryRoot: string;
  }): Promise<PullRequestReviewResult> {
    const validatedRequest = pullRequestReviewRequestSchema.parse(request);
    const result = await createToolLoopAgent(this.model, repositoryRoot).generate({
      prompt: buildPullRequestReviewPrompt(validatedRequest),
    });

    const normalizedResult = normalizeProviderPullRequestReviewResult(result.output);
    if (normalizedResult.reviewedCommitSha !== validatedRequest.headSha) {
      throw new OperationalError(
        { code: "REVIEW_SHA_MISMATCH", stage: "provider-response-validation" },
        { internalMessage: "Reviewer output does not match the requested head commit." },
      );
    }

    return normalizedResult;
  }
}

export function createPullRequestReviewer(model: LanguageModel): PullRequestReviewer {
  return new RepositoryScopedPullRequestReviewer(model);
}
