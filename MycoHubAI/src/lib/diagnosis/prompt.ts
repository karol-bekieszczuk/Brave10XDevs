import type { GrowLogRow } from "@/lib/grow-logs/types";
import type { DiagnosisKnowledgeChunk } from "@/lib/diagnosis/retrieval";

export interface BuildDiagnosisPromptInput {
  growLog: GrowLogRow;
  question: string;
  chunks: DiagnosisKnowledgeChunk[];
}

export function buildDiagnosisRetrievalText(growLog: GrowLogRow, question: string) {
  return [
    `Stage: ${growLog.stage}`,
    `Selected log title: ${growLog.title}`,
    `Selected log body: ${growLog.body}`,
    `User question: ${question}`,
  ].join("\n");
}

export function buildDiagnosisPrompt({ growLog, question, chunks }: BuildDiagnosisPromptInput) {
  const sources =
    chunks.length > 0
      ? chunks
          .map((chunk, index) =>
            [
              `Source ${index + 1}`,
              `Path: ${chunk.sourcePath}`,
              `Heading: ${chunk.sourceHeading ?? "Untitled"}`,
              `Stage: ${chunk.stage}`,
              `Content: ${chunk.content}`,
            ].join("\n"),
          )
          .join("\n\n")
      : "No same-stage knowledge chunks were retrieved.";

  return [
    "You are MycoHubAI's selected-log diagnosis assistant for text-based mushroom cultivation logs.",
    "",
    "Selected grow log:",
    `- Stage: ${growLog.stage}`,
    `- Title: ${growLog.title}`,
    `- Body: ${growLog.body}`,
    "",
    "User question:",
    question,
    "",
    "Retrieved same-stage knowledge:",
    sources,
    "",
    "Guardrails:",
    "- Base the answer on the selected grow log and retrieved same-stage knowledge only.",
    "- State uncertainty clearly; do not present causes or actions as guaranteed.",
    "- If same-stage knowledge is retrieved and the selected log includes concrete timing or visible observations, return scopeStatus in_scope with low or medium confidence instead of missing_context.",
    "- Use scopeStatus missing_context only when no same-stage knowledge was retrieved or the selected log lacks critical timing, appearance, growth-pattern, or handling details.",
    "- If the question mixes supported agar/grain troubleshooting with unsupported scope, use scopeStatus mixed_scope, answer only the supported portion, and decline the unsupported portion.",
    "- If the question is fully outside text-based agar or grain troubleshooting, use scopeStatus out_of_scope and redirect back to supported agar/grain log troubleshooting.",
    "- Never ask the user to check agar or grain by smell and never suggest smell-based advice.",
    "- Do not ask for or analyze photos, images, or uploads.",
    "- Do not give species-specific advice.",
    "- Do not rely on saved chat history or imply that chat history is stored.",
    "- Do not compare across multiple grow logs; use only this selected log.",
    "- When filling sources, copy only exact Path and Heading pairs from the retrieved same-stage knowledge above. Do not invent source labels, headings, paths, or citations.",
    "",
    "Return a structured diagnosis object that matches the provided schema exactly.",
  ].join("\n");
}
