import { DiagnosisError, toDiagnosisError } from "@/lib/diagnosis/errors";
import type { DiagnosisProvider } from "@/lib/diagnosis/provider";
import {
  matchDiagnosisKnowledgeChunks,
  type DiagnosisKnowledgeChunk,
  type DiagnosisRetrievalClient,
} from "@/lib/diagnosis/retrieval";
import { diagnosisRequestSchema, diagnosisResponseSchema, type DiagnosisApiResponse } from "@/lib/diagnosis/schema";
import { getOwnerGrowLog, type GrowLogClient } from "@/lib/grow-logs/repository";
import { isGrowLogStage, type GrowLogRow } from "@/lib/grow-logs/types";

export interface DiagnoseSelectedLogDependencies {
  getGrowLog?: (client: GrowLogClient, id: string, ownerId: string) => Promise<GrowLogRow | null>;
  provider?: DiagnosisProvider;
  retrieveChunks?: (
    client: DiagnosisRetrievalClient,
    args: { queryEmbedding: number[]; stage: "agar" | "grain" },
  ) => Promise<DiagnosisKnowledgeChunk[]>;
}

function missingContextResponse(): DiagnosisApiResponse {
  return {
    ok: true,
    diagnosis: {
      scopeStatus: "missing_context",
      possibleCauses: [],
      suggestedActions: [],
      confidenceBand: null,
      uncertainty: "The selected log and same-stage knowledge did not provide enough context for a diagnosis.",
      followUpQuestion:
        "What recent visual change, timing detail, or handling step should be added to this selected log?",
      sources: [],
    },
  };
}

export async function diagnoseSelectedLog(
  client: GrowLogClient & DiagnosisRetrievalClient,
  ownerId: string,
  input: unknown,
  dependencies: DiagnoseSelectedLogDependencies = {},
): Promise<DiagnosisApiResponse> {
  const request = diagnosisRequestSchema.safeParse(input);

  if (!request.success) {
    return new DiagnosisError("invalid_request", "Invalid diagnosis request.").toResponse();
  }

  const loadGrowLog = dependencies.getGrowLog ?? getOwnerGrowLog;
  const growLog = await loadGrowLog(client, request.data.growLogId, ownerId);

  if (!growLog) {
    return new DiagnosisError("grow_log_not_found", "Grow log was not found.").toResponse();
  }

  if (!isGrowLogStage(growLog.stage)) {
    return new DiagnosisError("unsupported_stage", "Diagnosis is only supported for agar and grain logs.").toResponse();
  }

  const provider = dependencies.provider;

  if (!provider) {
    return new DiagnosisError("provider_failed", "Diagnosis provider is not configured.").toResponse();
  }

  try {
    const queryEmbedding = await provider.createQueryEmbedding(growLog, request.data.question);
    const retrieve = dependencies.retrieveChunks ?? matchDiagnosisKnowledgeChunks;
    const chunks = await retrieve(client, {
      queryEmbedding,
      stage: growLog.stage,
    });

    if (chunks.length === 0) {
      return missingContextResponse();
    }

    const diagnosis = await provider.generateDiagnosis({
      growLog,
      question: request.data.question,
      chunks,
    });

    const parsed = diagnosisResponseSchema.safeParse(diagnosis);

    if (!parsed.success) {
      return new DiagnosisError(
        "invalid_model_output",
        "Diagnosis provider returned invalid structured output.",
      ).toResponse();
    }

    return {
      ok: true,
      diagnosis: parsed.data,
    };
  } catch (error) {
    if (error instanceof DiagnosisError) {
      return error.toResponse();
    }

    const code = error instanceof Error && error.message ? "retrieval_failed" : "provider_failed";
    return code === "retrieval_failed"
      ? new DiagnosisError("retrieval_failed", "Diagnosis knowledge retrieval failed.").toResponse()
      : toDiagnosisError(error).toResponse();
  }
}
