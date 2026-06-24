import { describe, expect, it } from "vitest";
import { buildDiagnosisPrompt, buildDiagnosisRetrievalText } from "./prompt";
import type { DiagnosisKnowledgeChunk } from "./retrieval";
import type { GrowLogRow } from "@/lib/grow-logs/types";

const growLog: GrowLogRow = {
  id: "log-1",
  ownerId: "owner-1",
  stage: "agar",
  title: "Plate A",
  body: "Growth is slow near the transfer point.",
  createdAt: "2026-06-01T10:00:00.000Z",
  updatedAt: "2026-06-01T11:00:00.000Z",
};

const chunk: DiagnosisKnowledgeChunk = {
  id: "chunk-1",
  sourcePath: "lib/diagnosis/knowledge/agar-slow-growth.md",
  sourceHeading: "Slow agar growth",
  stage: "agar",
  content: "Slow growth can require more observation before acting.",
  similarity: 0.84,
};

describe("diagnosis prompt", () => {
  it("builds retrieval text from the selected log and question", () => {
    expect(buildDiagnosisRetrievalText(growLog, "Is this plate stalled?")).toContain(
      "Selected log body: Growth is slow near the transfer point.",
    );
    expect(buildDiagnosisRetrievalText(growLog, "Is this plate stalled?")).toContain(
      "User question: Is this plate stalled?",
    );
  });

  it("includes F-03 guardrails and same-stage retrieved sources", () => {
    const prompt = buildDiagnosisPrompt({
      growLog,
      question: "Is this plate stalled?",
      chunks: [chunk],
    });

    expect(prompt).toContain("State uncertainty clearly");
    expect(prompt).toContain("scopeStatus mixed_scope");
    expect(prompt).toContain("scopeStatus out_of_scope");
    expect(prompt).toContain("Never ask the user to check agar or grain by smell");
    expect(prompt).toContain("Do not ask for or analyze photos, images, or uploads");
    expect(prompt).toContain("Do not give species-specific advice");
    expect(prompt).toContain("Do not rely on saved chat history");
    expect(prompt).toContain("Do not compare across multiple grow logs");
    expect(prompt).toContain("return scopeStatus in_scope with low or medium confidence instead of missing_context");
    expect(prompt).toContain("copy only exact Path and Heading pairs");
    expect(prompt).toContain("lib/diagnosis/knowledge/agar-slow-growth.md");
  });

  it("represents missing source headings as null for structured output", () => {
    const prompt = buildDiagnosisPrompt({
      growLog,
      question: "Is this plate stalled?",
      chunks: [{ ...chunk, sourceHeading: null }],
    });

    expect(prompt).toContain("Heading: null");
    expect(prompt).toContain("Use sourceHeading null when the retrieved Heading is null");
  });
});
