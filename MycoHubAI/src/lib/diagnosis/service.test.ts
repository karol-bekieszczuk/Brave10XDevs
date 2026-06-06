import { describe, expect, it, vi } from "vitest";
import { DiagnosisError } from "./errors";
import { diagnoseSelectedLog, type DiagnoseSelectedLogDependencies } from "./service";
import type { DiagnosisKnowledgeChunk, DiagnosisRetrievalClient } from "./retrieval";
import type { DiagnosisResponse } from "./schema";
import type { GrowLogClient } from "@/lib/grow-logs/repository";
import type { GrowLogRow } from "@/lib/grow-logs/types";

const client = {} as GrowLogClient & DiagnosisRetrievalClient;

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

function createDependencies(overrides: Partial<DiagnoseSelectedLogDependencies> = {}) {
  const provider = {
    createQueryEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    generateDiagnosis: vi.fn().mockResolvedValue(diagnosis),
  };

  return {
    getGrowLog: vi.fn().mockResolvedValue(growLog),
    provider,
    retrieveChunks: vi.fn().mockResolvedValue([chunk]),
    ...overrides,
  } satisfies DiagnoseSelectedLogDependencies;
}

describe("selected-log diagnosis service", () => {
  it("rejects invalid requests before loading the selected log", async () => {
    const dependencies = createDependencies();

    const response = await diagnoseSelectedLog(client, "owner-1", { growLogId: "", question: "" }, dependencies);

    expect(response).toEqual({
      ok: false,
      error: {
        code: "invalid_request",
        message: "Invalid diagnosis request.",
        retryable: false,
      },
    });
    expect(dependencies.getGrowLog).not.toHaveBeenCalled();
    expect(dependencies.provider.createQueryEmbedding).not.toHaveBeenCalled();
  });

  it("loads the owner-scoped grow log before embedding, retrieval, or generation", async () => {
    const order: string[] = [];
    const dependencies = createDependencies({
      getGrowLog: vi.fn().mockImplementation(() => {
        order.push("getGrowLog");
        return Promise.resolve(growLog);
      }),
      provider: {
        createQueryEmbedding: vi.fn().mockImplementation(() => {
          order.push("createQueryEmbedding");
          return Promise.resolve([0.1, 0.2, 0.3]);
        }),
        generateDiagnosis: vi.fn().mockImplementation(() => {
          order.push("generateDiagnosis");
          return Promise.resolve(diagnosis);
        }),
      },
      retrieveChunks: vi.fn().mockImplementation(() => {
        order.push("retrieveChunks");
        return Promise.resolve([chunk]);
      }),
    });

    const response = await diagnoseSelectedLog(
      client,
      "owner-1",
      { growLogId: "log-1", question: "Is this plate stalled?" },
      dependencies,
    );

    expect(response).toEqual({ ok: true, diagnosis });
    expect(dependencies.getGrowLog).toHaveBeenCalledWith(client, "log-1", "owner-1");
    expect(order).toEqual(["getGrowLog", "createQueryEmbedding", "retrieveChunks", "generateDiagnosis"]);
  });

  it("does not call provider or retrieval when the selected log is missing", async () => {
    const dependencies = createDependencies({
      getGrowLog: vi.fn().mockResolvedValue(null),
    });

    const response = await diagnoseSelectedLog(
      client,
      "owner-1",
      { growLogId: "missing", question: "Is this okay?" },
      dependencies,
    );

    expect(response.ok).toBe(false);
    expect(response.ok ? null : response.error.code).toBe("grow_log_not_found");
    expect(dependencies.provider.createQueryEmbedding).not.toHaveBeenCalled();
    expect(dependencies.retrieveChunks).not.toHaveBeenCalled();
  });

  it("returns missing_context when retrieval finds no same-stage chunks", async () => {
    const dependencies = createDependencies({
      retrieveChunks: vi.fn().mockResolvedValue([]),
    });

    const response = await diagnoseSelectedLog(
      client,
      "owner-1",
      { growLogId: "log-1", question: "Is this okay?" },
      dependencies,
    );

    expect(response.ok).toBe(true);
    expect(response.ok ? response.diagnosis.scopeStatus : null).toBe("missing_context");
    expect(dependencies.provider.generateDiagnosis).not.toHaveBeenCalled();
  });

  it("returns a controlled retryable provider error without diagnosis content", async () => {
    const dependencies = createDependencies({
      provider: {
        createQueryEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
        generateDiagnosis: vi.fn().mockRejectedValue(new DiagnosisError("provider_failed", "Provider failed.")),
      },
    });

    const response = await diagnoseSelectedLog(
      client,
      "owner-1",
      { growLogId: "log-1", question: "Is this okay?" },
      dependencies,
    );

    expect(response).toEqual({
      ok: false,
      error: {
        code: "provider_failed",
        message: "Provider failed.",
        retryable: true,
      },
    });
  });

  it("rejects invalid structured output from a mocked provider", async () => {
    const dependencies = createDependencies({
      provider: {
        createQueryEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
        generateDiagnosis: vi.fn().mockResolvedValue({
          scopeStatus: "fruiting_scope",
        }),
      },
    });

    const response = await diagnoseSelectedLog(
      client,
      "owner-1",
      { growLogId: "log-1", question: "Is this okay?" },
      dependencies,
    );

    expect(response.ok).toBe(false);
    expect(response.ok ? null : response.error.code).toBe("invalid_model_output");
    expect(response.ok ? null : response.error.retryable).toBe(true);
  });
});
