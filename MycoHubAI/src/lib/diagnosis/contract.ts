import { DiagnosisError } from "@/lib/diagnosis/errors";
import type { DiagnosisKnowledgeChunk } from "@/lib/diagnosis/retrieval";
import type { DiagnosisResponse } from "@/lib/diagnosis/schema";
import type { GrowLogRow } from "@/lib/grow-logs/types";

const certaintyPatterns = [
  /\bdefinitely\b/i,
  /\bcertain(?:ly)?\b/i,
  /\bguarante(?:e|ed|es)\b/i,
  /\bwithout doubt\b/i,
  /\bfor sure\b/i,
  /\bmust be\b/i,
  /\bna pewno\b/i,
];

const smellAdvicePatterns = [
  /\bsmell\b/i,
  /\bodou?r\b/i,
  /\bscent\b/i,
  /\bwhiff\b/i,
  /\bw[aą]cha/i,
  /\bpachn/i,
  /\bzapach/i,
];

function matchesAny(value: string | null, patterns: RegExp[]) {
  return value !== null && patterns.some((pattern) => pattern.test(value));
}

function invalidOutput(message: string) {
  return new DiagnosisError("invalid_model_output", message);
}

export function validateGeneratedDiagnosisContract(
  growLog: GrowLogRow,
  chunks: DiagnosisKnowledgeChunk[],
  diagnosis: DiagnosisResponse,
): DiagnosisResponse {
  const narrativeFields = [
    ...diagnosis.possibleCauses,
    ...diagnosis.suggestedActions,
    diagnosis.uncertainty,
    diagnosis.followUpQuestion,
  ];

  if (narrativeFields.some((field) => matchesAny(field, certaintyPatterns))) {
    throw invalidOutput("Diagnosis provider used unsupported certainty wording.");
  }

  if (
    [...diagnosis.suggestedActions, diagnosis.followUpQuestion].some((field) => matchesAny(field, smellAdvicePatterns))
  ) {
    throw invalidOutput("Diagnosis provider suggested unsupported smell-based troubleshooting.");
  }

  if (diagnosis.confidenceBand === "high" && diagnosis.sources.length === 0) {
    throw invalidOutput("High-confidence diagnosis responses must cite retrieved sources.");
  }

  const allowedSources = new Set(
    chunks
      .filter((chunk) => chunk.stage === growLog.stage)
      .map((chunk) => `${chunk.sourcePath}::${chunk.sourceHeading ?? ""}`),
  );

  if (allowedSources.size !== chunks.length) {
    throw invalidOutput("Retrieved diagnosis sources did not match the selected grow-log stage.");
  }

  const hasUnknownSource = diagnosis.sources.some(
    (source) => !allowedSources.has(`${source.sourcePath}::${source.sourceHeading ?? ""}`),
  );

  if (hasUnknownSource) {
    throw invalidOutput("Diagnosis provider cited a source that was not retrieved for this diagnosis.");
  }

  return diagnosis;
}
