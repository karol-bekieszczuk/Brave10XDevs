import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { embed, generateText, Output } from "ai";
import { buildDiagnosisPrompt, buildDiagnosisRetrievalText } from "@/lib/diagnosis/prompt";
import type { DiagnosisKnowledgeChunk } from "@/lib/diagnosis/retrieval";
import { diagnosisResponseSchema, type DiagnosisResponse } from "@/lib/diagnosis/schema";
import { DiagnosisError } from "@/lib/diagnosis/errors";
import type { GrowLogRow } from "@/lib/grow-logs/types";

const EMBEDDING_MODEL = "openai/text-embedding-3-small";
const DIAGNOSIS_MODEL = "qwen/qwen3-32b";
const QUERY_EMBEDDING_TIMEOUT_MS = 15_000;
const DIAGNOSIS_GENERATION_TIMEOUT_MS = 90_000;
type TextEmbeddingModel = Parameters<typeof embed>[0]["model"];

interface OpenRouterRuntimeEmbeddings {
  textEmbeddingModel(modelId: string): TextEmbeddingModel;
}

export interface DiagnosisGenerationInput {
  growLog: GrowLogRow;
  question: string;
  chunks: DiagnosisKnowledgeChunk[];
}

export interface DiagnosisProvider {
  createQueryEmbedding(growLog: GrowLogRow, question: string): Promise<number[]>;
  generateDiagnosis(input: DiagnosisGenerationInput): Promise<DiagnosisResponse>;
}

function toProviderError(error: unknown): DiagnosisError {
  if (error instanceof DiagnosisError) {
    return error;
  }

  if (error instanceof Error) {
    // eslint-disable-next-line no-console
    console.error("[diagnosis-provider] raw error", `${error.name}: ${error.message}`);
    // eslint-disable-next-line no-console
    console.error("[diagnosis-provider] raw error details", JSON.stringify(error, Object.getOwnPropertyNames(error)));
    // eslint-disable-next-line no-console
    console.error("[diagnosis-provider] stack", error.stack);
  } else {
    // eslint-disable-next-line no-console
    console.error("[diagnosis-provider] raw non-error", error);
  }

  if (
    error instanceof Error &&
    (error.name.toLowerCase().includes("timeout") || error.message.toLowerCase().includes("timeout"))
  ) {
    return new DiagnosisError("provider_timeout", "Diagnosis provider timed out.");
  }

  return new DiagnosisError("provider_failed", "Diagnosis provider failed.");
}

function createTextEmbeddingModel(provider: unknown, modelId: string) {
  return (provider as OpenRouterRuntimeEmbeddings).textEmbeddingModel(modelId);
}

export function createDiagnosisProvider(apiKey: string): DiagnosisProvider {
  if (!apiKey) {
    throw new DiagnosisError("provider_failed", "OpenRouter API key is not configured.");
  }

  const openrouter = createOpenRouter({
    apiKey,
    appName: "MycoHubAI",
    appUrl: "https://myco-hub-ai.karol-bekieszczuk.workers.dev",
  });

  return {
    async createQueryEmbedding(growLog, question) {
      try {
        const { embedding } = await embed({
          model: createTextEmbeddingModel(openrouter, EMBEDDING_MODEL),
          value: buildDiagnosisRetrievalText(growLog, question),
          abortSignal: AbortSignal.timeout(QUERY_EMBEDDING_TIMEOUT_MS),
        });

        return embedding;
      } catch (error) {
        throw toProviderError(error);
      }
    },

    async generateDiagnosis(input) {
      try {
        const { output } = await generateText({
          model: openrouter(DIAGNOSIS_MODEL),
          output: Output.object({
            schema: diagnosisResponseSchema,
          }),
          prompt: buildDiagnosisPrompt(input),
          abortSignal: AbortSignal.timeout(DIAGNOSIS_GENERATION_TIMEOUT_MS),
        });

        const parsed = diagnosisResponseSchema.safeParse(output);

        if (!parsed.success) {
          throw new DiagnosisError("invalid_model_output", "Diagnosis provider returned invalid structured output.");
        }

        return parsed.data;
      } catch (error) {
        throw toProviderError(error);
      }
    },
  };
}
