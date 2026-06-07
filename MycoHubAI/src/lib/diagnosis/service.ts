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

const unsupportedScopePatterns = [
  /\bfruit(?:ing|s)?\b/i,
  /\byield\b/i,
  /\bflush(?:es)?\b/i,
  /\bpinning\b/i,
  /\bpins?\b/i,
  /\btubs?\b/i,
  /\bmonotubs?\b/i,
  /\bflowers?\b/i,
  /\bflowering\b/i,
  /\bkwitn/i,
  /\bowocnik/i,
  /\bplon/i,
  /\bspecies\b/i,
  /\bstrain\b/i,
  /\bgatun/i,
  /\bodmian/i,
  /\bphotos?\b/i,
  /\bimages?\b/i,
  /\bpictures?\b/i,
  /\buploads?\b/i,
  /\bzdj[eę]c/i,
  /\bobraz/i,
  /\budost[eę]pn/i,
  /\bshare\b/i,
];

const supportedScopePatterns = [
  /\bagar\b/i,
  /\bplate\b/i,
  /\bgrain\b/i,
  /\bjars?\b/i,
  /\bcoloniz/i,
  /\bmycel/i,
  /\bcontamin/i,
  /\bstall/i,
  /\brecover/i,
  /\bshake\b/i,
  /\bzbo[zż]/i,
  /\bs[lł]oik/i,
  /\bkoloniz/i,
  /\bgrzybni/i,
  /\bkontamin/i,
  /\bzatrzym/i,
];

const smellCheckPatterns = [
  /\bsmell\b/i,
  /\bodou?r\b/i,
  /\bscent\b/i,
  /\bwhiff\b/i,
  /\bw[aą]cha/i,
  /\bpachn/i,
  /\bzapach/i,
];

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

function matchesAny(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(value));
}

function guardrailResponse(question: string): DiagnosisApiResponse | null {
  const asksAboutSmell = matchesAny(question, smellCheckPatterns);

  if (asksAboutSmell) {
    return {
      ok: true,
      diagnosis: {
        scopeStatus: "in_scope",
        possibleCauses: [],
        suggestedActions: [
          "Do not use smell as a check for agar or grain. Keep the assessment text-based and rely on visible changes, timing, and handling history.",
          "Add direct visual details to the selected log, such as stalled growth, unusual colors, wet-looking grain, or post-shake recovery timing.",
        ],
        confidenceBand: null,
        uncertainty: "Smell is not a safe or supported diagnostic signal for this agar/grain troubleshooting flow.",
        followUpQuestion: "What visible change or timing detail led you to suspect contamination?",
        sources: [],
      },
    };
  }

  const asksUnsupportedScope = matchesAny(question, unsupportedScopePatterns);

  if (!asksUnsupportedScope) {
    return null;
  }

  const asksSupportedScope = matchesAny(question, supportedScopePatterns);

  if (asksSupportedScope) {
    return {
      ok: true,
      diagnosis: {
        scopeStatus: "mixed_scope",
        possibleCauses: [],
        suggestedActions: [
          "Use this selected log only for agar or grain-stage troubleshooting.",
          "Rephrase the unsupported part as a visible agar or grain observation if you want it assessed here.",
        ],
        confidenceBand: null,
        uncertainty:
          "The question mixes supported agar/grain troubleshooting with unsupported scope, so only the supported portion can be considered.",
        followUpQuestion: "What agar or grain-stage symptom from this selected log should be diagnosed?",
        sources: [],
      },
    };
  }

  return {
    ok: true,
    diagnosis: {
      scopeStatus: "out_of_scope",
      possibleCauses: [],
      suggestedActions: [
        "Ask a text-based troubleshooting question about the selected agar or grain log instead.",
        "Include visible symptoms, timing, and recent handling steps from the selected log.",
      ],
      confidenceBand: null,
      uncertainty: "MycoHubAI currently supports text-based agar and grain-stage troubleshooting only.",
      followUpQuestion: "What agar or grain-stage issue from this selected log do you want to troubleshoot?",
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

  const scopedGuardrailResponse = guardrailResponse(request.data.question);

  if (scopedGuardrailResponse) {
    return scopedGuardrailResponse;
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
