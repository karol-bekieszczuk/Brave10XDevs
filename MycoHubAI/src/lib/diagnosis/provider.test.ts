import { beforeEach, describe, expect, it, vi } from "vitest";
import { DiagnosisError } from "./errors";
import type { DiagnosisKnowledgeChunk } from "./retrieval";
import type { DiagnosisResponse } from "./schema";
import type { GrowLogRow } from "@/lib/grow-logs/types";

const embedMock = vi.fn();
const generateTextMock = vi.fn();

const openRouterModelMock = vi.fn((modelId: string) => ({ type: "language", modelId }));
const textEmbeddingModelMock = vi.fn((modelId: string) => ({ type: "embedding", modelId }));
const createOpenRouterMock = vi.fn(() =>
  Object.assign(openRouterModelMock, { textEmbeddingModel: textEmbeddingModelMock }),
);
const outputObjectMock = vi.fn((input: unknown) => input);

vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: createOpenRouterMock,
}));

vi.mock("ai", () => ({
  embed: embedMock,
  generateText: generateTextMock,
  Output: {
    object: outputObjectMock,
  },
}));

const { createDiagnosisProvider } = await import("./provider");

const growLog: GrowLogRow = {
  id: "log-1",
  ownerId: "owner-1",
  stage: "agar",
  title: "Plate A",
  body: "White growth is slow after transfer.",
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

const diagnosis: DiagnosisResponse = {
  scopeStatus: "in_scope",
  possibleCauses: ["The plate may still be recovering from transfer."],
  suggestedActions: ["Log another visual observation before changing course."],
  confidenceBand: "low",
  uncertainty: "The selected log has limited timing detail.",
  followUpQuestion: null,
  sources: [{ sourcePath: chunk.sourcePath, sourceHeading: chunk.sourceHeading }],
};

describe("diagnosis provider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes timeout abort signals to embedding and generation calls", async () => {
    embedMock.mockResolvedValue({ embedding: [0.1, 0.2, 0.3] });
    generateTextMock.mockResolvedValue({ output: diagnosis });

    const provider = createDiagnosisProvider("test-key");
    await provider.createQueryEmbedding(growLog, "Is this plate stalled?");
    await provider.generateDiagnosis({
      growLog,
      question: "Is this plate stalled?",
      chunks: [chunk],
    });

    const embedOptions = embedMock.mock.calls[0]?.[0] as { abortSignal?: unknown };
    const generateOptions = generateTextMock.mock.calls[0]?.[0] as { abortSignal?: unknown };

    expect(embedOptions.abortSignal).toBeInstanceOf(AbortSignal);
    expect(generateOptions.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it("rejects partial structured output from generateText", async () => {
    embedMock.mockResolvedValue({ embedding: [0.1, 0.2, 0.3] });
    generateTextMock.mockResolvedValue({
      output: {
        scopeStatus: "in_scope",
        possibleCauses: ["Maybe"],
      },
    });

    const provider = createDiagnosisProvider("test-key");

    await expect(
      provider.generateDiagnosis({
        growLog,
        question: "Is this plate stalled?",
        chunks: [chunk],
      }),
    ).rejects.toMatchObject({
      code: "invalid_model_output",
    } satisfies Partial<DiagnosisError>);
  });

  it("rejects wrong-shaped structured output from generateText", async () => {
    embedMock.mockResolvedValue({ embedding: [0.1, 0.2, 0.3] });
    generateTextMock.mockResolvedValue({
      output: ["not", "an", "object"],
    });

    const provider = createDiagnosisProvider("test-key");

    await expect(
      provider.generateDiagnosis({
        growLog,
        question: "Is this plate stalled?",
        chunks: [chunk],
      }),
    ).rejects.toMatchObject({
      code: "invalid_model_output",
    } satisfies Partial<DiagnosisError>);
  });

  it("maps provider timeout errors to the controlled provider_timeout category", async () => {
    embedMock.mockRejectedValue(Object.assign(new Error("request timeout"), { name: "TimeoutError" }));

    const provider = createDiagnosisProvider("test-key");

    await expect(provider.createQueryEmbedding(growLog, "Is this plate stalled?")).rejects.toMatchObject({
      code: "provider_timeout",
    } satisfies Partial<DiagnosisError>);
  });
});
