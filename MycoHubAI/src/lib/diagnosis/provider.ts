import { createOpenAI } from "@ai-sdk/openai";
import { embed, generateText, Output } from "ai";
import { buildDiagnosisPrompt, buildDiagnosisRetrievalText } from "@/lib/diagnosis/prompt";
import type { DiagnosisKnowledgeChunk } from "@/lib/diagnosis/retrieval";
import { diagnosisResponseSchema, type DiagnosisResponse } from "@/lib/diagnosis/schema";
import { DiagnosisError } from "@/lib/diagnosis/errors";
import type { GrowLogRow } from "@/lib/grow-logs/types";

const EMBEDDING_MODEL = "text-embedding-3-small";
const DIAGNOSIS_MODEL = "gpt-4o-mini";

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

  if (error instanceof Error && error.name.toLowerCase().includes("timeout")) {
    return new DiagnosisError("provider_timeout", "Diagnosis provider timed out.");
  }

  return new DiagnosisError("provider_failed", "Diagnosis provider failed.");
}

export function createDiagnosisProvider(apiKey: string): DiagnosisProvider {
  if (!apiKey) {
    throw new DiagnosisError("provider_failed", "OpenAI API key is not configured.");
  }

  const openai = createOpenAI({ apiKey });

  return {
    async createQueryEmbedding(growLog, question) {
      try {
        const { embedding } = await embed({
          model: openai.embedding(EMBEDDING_MODEL),
          value: buildDiagnosisRetrievalText(growLog, question),
        });

        return embedding;
      } catch (error) {
        throw toProviderError(error);
      }
    },

    async generateDiagnosis(input) {
      try {
        const { output } = await generateText({
          model: openai(DIAGNOSIS_MODEL),
          output: Output.object({
            schema: diagnosisResponseSchema,
          }),
          prompt: buildDiagnosisPrompt(input),
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
