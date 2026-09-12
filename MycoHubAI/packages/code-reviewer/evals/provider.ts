import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import type { ApiProvider, CallApiContextParams, ProviderOptions, ProviderResponse } from "promptfoo";
import { z } from "zod";
import {
  buildPullRequestReviewPrompt,
  createPullRequestReviewer,
  PULL_REQUEST_REVIEWER_INSTRUCTIONS,
  pullRequestReviewRequestSchema,
  pullRequestReviewResultSchema,
  type PullRequestReviewer,
  type PullRequestReviewRequest,
} from "../src/index.js";

const KNOWN_CASE_IDS = ["react-16-to-19-profile-editor"] as const;
const caseIdSchema = z.enum(KNOWN_CASE_IDS);
const providerConfigSchema = z
  .object({
    model: z.string().trim().min(1),
  })
  .strict();
const testVariablesSchema = z
  .object({
    caseId: caseIdSchema,
  })
  .loose();

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));

interface ProviderDependencies {
  fixtureRoot: string;
  getEnvironment: () => Record<string, string | undefined>;
  readFile: (filePath: string) => Promise<string>;
  realpath: (filePath: string) => Promise<string>;
  createModel: (apiKey: string, model: string) => LanguageModel;
  createReviewer: (model: LanguageModel) => PullRequestReviewer;
}

const defaultDependencies: ProviderDependencies = {
  fixtureRoot: path.join(moduleDirectory, "cases"),
  getEnvironment: () => process.env,
  readFile: (filePath) => readFile(filePath, "utf8"),
  realpath: (filePath) => realpath(filePath),
  createModel: (apiKey, model) => createOpenRouter({ apiKey })(model),
  createReviewer: createPullRequestReviewer,
};

function isWithin(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}

function promptFingerprint(request: PullRequestReviewRequest): string {
  const productionPrompt = buildPullRequestReviewPrompt(request);
  return createHash("sha256")
    .update(PULL_REQUEST_REVIEWER_INSTRUCTIONS)
    .update("\n")
    .update(productionPrompt)
    .digest("hex");
}

function providerError(error: string): ProviderResponse {
  return { error };
}

export default class CodeReviewEvalProvider implements ApiProvider {
  private readonly dependencies: ProviderDependencies;

  constructor(
    private readonly options: ProviderOptions = {},
    dependencies: Partial<ProviderDependencies> = {},
  ) {
    this.dependencies = { ...defaultDependencies, ...dependencies };
  }

  id(): string {
    const config = providerConfigSchema.safeParse(this.options.config);
    return config.success ? `code-review-evals:${config.data.model}` : "code-review-evals:invalid";
  }

  async callApi(_prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    const config = providerConfigSchema.safeParse(this.options.config);
    if (!config.success) {
      return providerError("Invalid code-review eval provider configuration.");
    }

    const variables = testVariablesSchema.safeParse(context?.vars);
    if (!variables.success) {
      return providerError("Invalid code-review eval case.");
    }

    const apiKey = this.dependencies.getEnvironment().OPENROUTER_API_KEY?.trim();
    if (!apiKey) {
      return providerError("OPENROUTER_API_KEY is required.");
    }

    try {
      const fixtureRoot = await this.dependencies.realpath(this.dependencies.fixtureRoot);
      const caseRoot = path.resolve(fixtureRoot, variables.data.caseId);
      if (!isWithin(fixtureRoot, caseRoot)) {
        return providerError("Invalid code-review eval case.");
      }

      const requestPath = await this.dependencies.realpath(path.join(caseRoot, "request.json"));
      const repositoryRoot = await this.dependencies.realpath(path.join(caseRoot, "repository"));
      if (!isWithin(caseRoot, requestPath) || !isWithin(caseRoot, repositoryRoot)) {
        return providerError("Invalid code-review eval case.");
      }

      const request = pullRequestReviewRequestSchema.parse(JSON.parse(await this.dependencies.readFile(requestPath)));
      const model = this.dependencies.createModel(apiKey, config.data.model);
      const result = pullRequestReviewResultSchema.parse(
        await this.dependencies.createReviewer(model).generate({ request, repositoryRoot }),
      );

      return {
        output: JSON.stringify(result),
        format: "json",
        metadata: {
          model: config.data.model,
          caseId: variables.data.caseId,
          promptFingerprint: promptFingerprint(request),
        },
      };
    } catch {
      return providerError("Code-review evaluation failed.");
    }
  }
}
