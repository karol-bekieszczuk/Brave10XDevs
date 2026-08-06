import { describe, expect, it, vi } from "vitest";
import { DiagnosisError } from "./errors";
import { diagnoseSelectedLog, type DiagnoseSelectedLogDependencies } from "./service";
import type { DiagnosisKnowledgeChunk, DiagnosisRetrievalClient } from "./retrieval";
import type { DiagnosisAdmissionClient } from "./admission";
import type { DiagnosisResponse } from "./schema";
import type { GrowLogClient } from "@/lib/grow-logs/repository";
import type { GrowLogRow } from "@/lib/grow-logs/types";

const client = {} as GrowLogClient & DiagnosisRetrievalClient & DiagnosisAdmissionClient;

const growLog: GrowLogRow = {
  id: "550e8400-e29b-41d4-a716-446655440000",
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
    acquireAdmission: vi.fn().mockResolvedValue({ admitted: true, claimId: "claim-1" }),
    releaseAdmission: vi.fn().mockResolvedValue(undefined),
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

  it("rejects malformed grow-log UUIDs before lookup or provider construction", async () => {
    const createProvider = vi.fn(() => createDependencies().provider);
    const dependencies = createDependencies({
      provider: undefined,
      createProvider,
    });

    const response = await diagnoseSelectedLog(
      client,
      "owner-1",
      { growLogId: "not-a-uuid", question: "Is this plate stalled?" },
      dependencies,
    );

    expect(response).toEqual({
      ok: false,
      error: {
        code: "invalid_request",
        message: "Invalid diagnosis request.",
        retryable: false,
      },
    });
    expect(dependencies.getGrowLog).not.toHaveBeenCalled();
    expect(createProvider).not.toHaveBeenCalled();
  });

  it("loads the owner-scoped grow log before embedding, retrieval, or generation", async () => {
    const order: string[] = [];
    const dependencies = createDependencies({
      getGrowLog: vi.fn().mockImplementation(() => {
        order.push("getGrowLog");
        return Promise.resolve(growLog);
      }),
      provider: undefined,
      createProvider: vi.fn().mockImplementation(() => {
        order.push("createProvider");
        return {
          createQueryEmbedding: vi.fn().mockImplementation(() => {
            order.push("createQueryEmbedding");
            return Promise.resolve([0.1, 0.2, 0.3]);
          }),
          generateDiagnosis: vi.fn().mockImplementation(() => {
            order.push("generateDiagnosis");
            return Promise.resolve(diagnosis);
          }),
        };
      }),
      retrieveChunks: vi.fn().mockImplementation(() => {
        order.push("retrieveChunks");
        return Promise.resolve([chunk]);
      }),
    });

    const response = await diagnoseSelectedLog(
      client,
      "owner-1",
      { growLogId: "550e8400-e29b-41d4-a716-446655440000", question: "Is this plate stalled?" },
      dependencies,
    );

    expect(response).toEqual({ ok: true, diagnosis });
    expect(dependencies.getGrowLog).toHaveBeenCalledWith(client, "550e8400-e29b-41d4-a716-446655440000", "owner-1");
    expect(order).toEqual([
      "getGrowLog",
      "createProvider",
      "createQueryEmbedding",
      "retrieveChunks",
      "generateDiagnosis",
    ]);
  });

  it("does not call provider or retrieval when the selected log is missing", async () => {
    const dependencies = createDependencies({
      getGrowLog: vi.fn().mockResolvedValue(null),
    });

    const response = await diagnoseSelectedLog(
      client,
      "owner-1",
      { growLogId: "7f6c9a4e-308b-4a17-a0e3-ff2d6d912345", question: "Is this okay?" },
      dependencies,
    );

    expect(response.ok).toBe(false);
    expect(response.ok ? null : response.error.code).toBe("grow_log_not_found");
    expect(dependencies.provider.createQueryEmbedding).not.toHaveBeenCalled();
    expect(dependencies.retrieveChunks).not.toHaveBeenCalled();
  });

  it("does not create the provider when the selected log is missing", async () => {
    const createProvider = vi.fn(() => createDependencies().provider);
    const dependencies = createDependencies({
      getGrowLog: vi.fn().mockResolvedValue(null),
      provider: undefined,
      createProvider,
    });

    const response = await diagnoseSelectedLog(
      client,
      "owner-1",
      { growLogId: "7f6c9a4e-308b-4a17-a0e3-ff2d6d912345", question: "Is this okay?" },
      dependencies,
    );

    expect(response.ok).toBe(false);
    expect(response.ok ? null : response.error.code).toBe("grow_log_not_found");
    expect(createProvider).not.toHaveBeenCalled();
  });

  it("returns missing_context when retrieval finds no same-stage chunks", async () => {
    const dependencies = createDependencies({
      retrieveChunks: vi.fn().mockResolvedValue([]),
    });

    const response = await diagnoseSelectedLog(
      client,
      "owner-1",
      { growLogId: "550e8400-e29b-41d4-a716-446655440000", question: "Is this okay?" },
      dependencies,
    );

    expect(response.ok).toBe(true);
    expect(response.ok ? response.diagnosis.scopeStatus : null).toBe("missing_context");
    expect(dependencies.provider.generateDiagnosis).not.toHaveBeenCalled();
  });

  it("returns missing_context for selected logs that explicitly lack critical observation detail", async () => {
    const dependencies = createDependencies({
      getGrowLog: vi.fn().mockResolvedValue({
        ...growLog,
        body: "Agar plate started this week. No details recorded about appearance, timing, transfer source, growth pattern, or contamination signs.",
      }),
    });

    const response = await diagnoseSelectedLog(
      client,
      "owner-1",
      { growLogId: "550e8400-e29b-41d4-a716-446655440000", question: "What is wrong with my plate?" },
      dependencies,
    );

    expect(response.ok ? response.diagnosis.scopeStatus : null).toBe("missing_context");
    expect(dependencies.provider.createQueryEmbedding).not.toHaveBeenCalled();
    expect(dependencies.retrieveChunks).not.toHaveBeenCalled();
  });

  it("rejects schema-valid guarantee wording from the provider", async () => {
    const dependencies = createDependencies({
      provider: {
        createQueryEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
        generateDiagnosis: vi.fn().mockResolvedValue({
          ...diagnosis,
          uncertainty: "This definitely means contamination.",
        }),
      },
    });

    const response = await diagnoseSelectedLog(
      client,
      "owner-1",
      { growLogId: "550e8400-e29b-41d4-a716-446655440000", question: "Is this plate contaminated?" },
      dependencies,
    );

    expect(response.ok).toBe(false);
    expect(response.ok ? null : response.error.code).toBe("invalid_model_output");
  });

  it("allows negated guarantee wording as uncertainty instead of certainty", async () => {
    const dependencies = createDependencies({
      provider: {
        createQueryEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
        generateDiagnosis: vi.fn().mockResolvedValue({
          ...diagnosis,
          uncertainty: "This recovery signal is not guaranteed and should be checked against the next visible update.",
        }),
      },
    });

    const response = await diagnoseSelectedLog(
      client,
      "owner-1",
      { growLogId: "550e8400-e29b-41d4-a716-446655440000", question: "Is this plate recovering?" },
      dependencies,
    );

    expect(response.ok).toBe(true);
    expect(response.ok ? response.diagnosis.uncertainty : "").toContain("not guaranteed");
  });

  it("rejects provider sources that were not retrieved for the diagnosis", async () => {
    const dependencies = createDependencies({
      provider: {
        createQueryEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
        generateDiagnosis: vi.fn().mockResolvedValue({
          ...diagnosis,
          sources: [{ sourcePath: "lib/diagnosis/knowledge/grain-wet-jar.md", sourceHeading: "Wet grain jars" }],
        }),
      },
    });

    const response = await diagnoseSelectedLog(
      client,
      "owner-1",
      { growLogId: "550e8400-e29b-41d4-a716-446655440000", question: "Is this plate contaminated?" },
      dependencies,
    );

    expect(response.ok).toBe(false);
    expect(response.ok ? null : response.error.code).toBe("invalid_model_output");
  });

  it("accepts placeholder heading labels only when the retrieved source heading is null", async () => {
    const headinglessChunk: DiagnosisKnowledgeChunk = {
      ...chunk,
      sourceHeading: null,
    };
    const dependencies = createDependencies({
      retrieveChunks: vi.fn().mockResolvedValue([headinglessChunk]),
      provider: {
        createQueryEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
        generateDiagnosis: vi.fn().mockResolvedValue({
          ...diagnosis,
          sources: [{ sourcePath: headinglessChunk.sourcePath, sourceHeading: "Untitled" }],
        }),
      },
    });

    const response = await diagnoseSelectedLog(
      client,
      "owner-1",
      { growLogId: "550e8400-e29b-41d4-a716-446655440000", question: "Is this plate contaminated?" },
      dependencies,
    );

    expect(response.ok).toBe(true);
  });

  it("rejects high-confidence diagnoses that cite no retrieved sources", async () => {
    const dependencies = createDependencies({
      provider: {
        createQueryEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
        generateDiagnosis: vi.fn().mockResolvedValue({
          ...diagnosis,
          confidenceBand: "high",
          sources: [],
        }),
      },
    });

    const response = await diagnoseSelectedLog(
      client,
      "owner-1",
      { growLogId: "550e8400-e29b-41d4-a716-446655440000", question: "Is this plate contaminated?" },
      dependencies,
    );

    expect(response.ok).toBe(false);
    expect(response.ok ? null : response.error.code).toBe("invalid_model_output");
  });

  it("rejects smell-based advice returned by the provider", async () => {
    const dependencies = createDependencies({
      provider: {
        createQueryEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
        generateDiagnosis: vi.fn().mockResolvedValue({
          ...diagnosis,
          suggestedActions: ["Smell the jar before deciding what to do next."],
        }),
      },
    });

    const response = await diagnoseSelectedLog(
      client,
      "owner-1",
      { growLogId: "550e8400-e29b-41d4-a716-446655440000", question: "Why is this jar stalled?" },
      dependencies,
    );

    expect(response.ok).toBe(false);
    expect(response.ok ? null : response.error.code).toBe("invalid_model_output");
  });

  it("returns mixed_scope for questions that combine selected grain diagnosis with fruiting scope", async () => {
    const dependencies = createDependencies({
      getGrowLog: vi.fn().mockResolvedValue({
        ...growLog,
        stage: "grain",
        body: "The jar stalled after shaking and a wet patch has not changed for 3 days.",
      }),
      retrieveChunks: vi.fn().mockResolvedValue([]),
    });

    const response = await diagnoseSelectedLog(
      client,
      "owner-1",
      {
        growLogId: "550e8400-e29b-41d4-a716-446655440000",
        question: "What does this grain log suggest, and how should I improve fruiting conditions?",
      },
      dependencies,
    );

    expect(response.ok).toBe(true);
    expect(response.ok ? response.diagnosis.scopeStatus : null).toBe("mixed_scope");
    expect(response.ok ? response.diagnosis.uncertainty : "").toContain("unsupported scope");
    expect(dependencies.provider.createQueryEmbedding).not.toHaveBeenCalled();
    expect(dependencies.retrieveChunks).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "out_of_scope prompts",
      question: "Can you identify this species from a photo?",
      expectedScope: "out_of_scope",
    },
    {
      name: "mixed_scope prompts",
      question: "What does this agar log suggest, and how should I improve fruiting conditions?",
      expectedScope: "mixed_scope",
    },
  ])("routes $name before thin-log missing_context", async ({ question, expectedScope }) => {
    const dependencies = createDependencies({
      getGrowLog: vi.fn().mockResolvedValue({
        ...growLog,
        body: "Agar plate started this week. No details recorded about appearance, timing, transfer source, growth pattern, or contamination signs.",
      }),
    });

    const response = await diagnoseSelectedLog(
      client,
      "owner-1",
      { growLogId: "550e8400-e29b-41d4-a716-446655440000", question },
      dependencies,
    );

    expect(response.ok).toBe(true);
    expect(response.ok ? response.diagnosis.scopeStatus : null).toBe(expectedScope);
    expect(dependencies.provider.createQueryEmbedding).not.toHaveBeenCalled();
    expect(dependencies.retrieveChunks).not.toHaveBeenCalled();
  });

  it("returns out_of_scope for species or photo identification questions before retrieval fallback", async () => {
    const dependencies = createDependencies({
      retrieveChunks: vi.fn().mockResolvedValue([]),
    });

    const response = await diagnoseSelectedLog(
      client,
      "owner-1",
      { growLogId: "550e8400-e29b-41d4-a716-446655440000", question: "Can you identify this species from a photo?" },
      dependencies,
    );

    expect(response.ok).toBe(true);
    expect(response.ok ? response.diagnosis.scopeStatus : null).toBe("out_of_scope");
    expect(response.ok ? response.diagnosis.uncertainty : "").toContain("agar and grain-stage troubleshooting only");
    expect(dependencies.provider.createQueryEmbedding).not.toHaveBeenCalled();
    expect(dependencies.retrieveChunks).not.toHaveBeenCalled();
  });

  it("does not treat generic contamination wording as mixed scope for photo/species requests", async () => {
    const dependencies = createDependencies({
      retrieveChunks: vi.fn().mockResolvedValue([]),
    });

    const response = await diagnoseSelectedLog(
      client,
      "owner-1",
      {
        growLogId: "550e8400-e29b-41d4-a716-446655440000",
        question: "Identify the contamination from a photo and tell me the exact species.",
      },
      dependencies,
    );

    expect(response.ok).toBe(true);
    expect(response.ok ? response.diagnosis.scopeStatus : null).toBe("out_of_scope");
    expect(response.ok ? response.diagnosis.suggestedActions.join(" ") : "").toContain("text-based");
    expect(dependencies.provider.createQueryEmbedding).not.toHaveBeenCalled();
    expect(dependencies.retrieveChunks).not.toHaveBeenCalled();
  });

  it("returns a no-smell guardrail response before retrieval fallback", async () => {
    const dependencies = createDependencies({
      getGrowLog: vi.fn().mockResolvedValue({
        ...growLog,
        stage: "grain",
        body: "The jar has wet-looking grains and stalled recovery after shaking.",
      }),
      retrieveChunks: vi.fn().mockResolvedValue([]),
    });

    const response = await diagnoseSelectedLog(
      client,
      "owner-1",
      { growLogId: "550e8400-e29b-41d4-a716-446655440000", question: "Should I smell the jar to check contamination?" },
      dependencies,
    );

    expect(response.ok).toBe(true);
    expect(response.ok ? response.diagnosis.scopeStatus : null).toBe("in_scope");
    expect(response.ok ? response.diagnosis.uncertainty : "").toContain("Smell is not a safe");
    expect(response.ok ? response.diagnosis.suggestedActions.join(" ") : "").toContain("Do not use smell");
    expect(dependencies.provider.createQueryEmbedding).not.toHaveBeenCalled();
    expect(dependencies.retrieveChunks).not.toHaveBeenCalled();
  });

  it.each([
    {
      question: "Can you remember this chat history for later and diagnose the agar plate?",
      expectedScope: "mixed_scope",
    },
    {
      question: "Diagnose this grain jar and share the log with another grower for me.",
      expectedScope: "mixed_scope",
    },
    {
      question: "Diagnose this grain jar and compare it with my other logs.",
      expectedScope: "mixed_scope",
    },
    {
      question: "Diagnose this grain jar and export the report as a PDF.",
      expectedScope: "mixed_scope",
    },
    {
      question: "How do I export all of my diagnosis history?",
      expectedScope: "out_of_scope",
    },
    {
      question: "Can another user manage this grow log for me?",
      expectedScope: "out_of_scope",
    },
  ])("short-circuits unsupported F-03 non-goals: $question", async ({ question, expectedScope }) => {
    const dependencies = createDependencies();

    const response = await diagnoseSelectedLog(
      client,
      "owner-1",
      { growLogId: "550e8400-e29b-41d4-a716-446655440000", question },
      dependencies,
    );

    expect(response.ok).toBe(true);
    expect(response.ok ? response.diagnosis.scopeStatus : null).toBe(expectedScope);
    expect(dependencies.provider.createQueryEmbedding).not.toHaveBeenCalled();
    expect(dependencies.retrieveChunks).not.toHaveBeenCalled();
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
      { growLogId: "550e8400-e29b-41d4-a716-446655440000", question: "Is this okay?" },
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

  it("redacts raw provider exceptions into the controlled provider_failed message", async () => {
    const dependencies = createDependencies({
      provider: {
        createQueryEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
        generateDiagnosis: vi.fn().mockRejectedValue(new Error("raw provider stack")),
      },
    });

    const response = await diagnoseSelectedLog(
      client,
      "owner-1",
      { growLogId: "550e8400-e29b-41d4-a716-446655440000", question: "Is this okay?" },
      dependencies,
    );

    expect(response).toEqual({
      ok: false,
      error: {
        code: "provider_failed",
        message: "Diagnosis generation failed.",
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
      { growLogId: "550e8400-e29b-41d4-a716-446655440000", question: "Is this okay?" },
      dependencies,
    );

    expect(response.ok).toBe(false);
    expect(response.ok ? null : response.error.code).toBe("invalid_model_output");
    expect(response.ok ? null : response.error.retryable).toBe(true);
  });

  it("admits ten sequential provider-bearing attempts and rejects the eleventh", async () => {
    let attempts = 0;
    const acquireAdmission = vi.fn().mockImplementation(() => {
      attempts += 1;
      return Promise.resolve(
        attempts <= 10
          ? { admitted: true as const, claimId: `claim-${attempts}` }
          : { admitted: false as const, retryAfterSeconds: 600 },
      );
    });
    const dependencies = createDependencies({ acquireAdmission });
    const responses = [];

    for (let index = 0; index < 11; index += 1) {
      responses.push(
        await diagnoseSelectedLog(
          client,
          "owner-1",
          { growLogId: growLog.id, question: `Is this plate stalled attempt ${index + 1}?` },
          dependencies,
        ),
      );
    }

    expect(responses.slice(0, 10).every((response) => response.ok)).toBe(true);
    expect(responses[10]).toEqual({
      ok: false,
      error: {
        code: "rate_limited",
        message: "Diagnosis requests are temporarily limited. Try again later.",
        retryable: true,
        retryAfterSeconds: 600,
      },
    });
    expect(dependencies.provider.generateDiagnosis).toHaveBeenCalledTimes(10);
    expect(dependencies.releaseAdmission).toHaveBeenCalledTimes(10);
  });

  it("starts only one provider-bearing request while a claim is active", async () => {
    let resolveGeneration!: (value: DiagnosisResponse) => void;
    const heldGeneration = new Promise<DiagnosisResponse>((resolve) => {
      resolveGeneration = resolve;
    });
    const dependencies = createDependencies({
      acquireAdmission: vi
        .fn()
        .mockResolvedValueOnce({ admitted: true, claimId: "claim-1" })
        .mockResolvedValueOnce({ admitted: false, retryAfterSeconds: 120 }),
      provider: {
        createQueryEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
        generateDiagnosis: vi.fn().mockReturnValue(heldGeneration),
      },
    });

    const first = diagnoseSelectedLog(
      client,
      "owner-1",
      { growLogId: growLog.id, question: "Is this plate stalled?" },
      dependencies,
    );
    await vi.waitFor(() => {
      expect(dependencies.provider.generateDiagnosis).toHaveBeenCalledTimes(1);
    });
    const second = await diagnoseSelectedLog(
      client,
      "owner-1",
      { growLogId: growLog.id, question: "Is this plate recovering?" },
      dependencies,
    );

    expect(second.ok ? null : second.error.code).toBe("rate_limited");
    expect(dependencies.provider.generateDiagnosis).toHaveBeenCalledTimes(1);
    resolveGeneration(diagnosis);
    await expect(first).resolves.toEqual({ ok: true, diagnosis });
  });

  it("does not acquire admission for invalid, missing, unsupported, or thin-context requests", async () => {
    const cases: { input: unknown; selectedLog?: GrowLogRow | null }[] = [
      { input: { growLogId: "invalid", question: "Question" } },
      { input: { growLogId: growLog.id, question: "Question" }, selectedLog: null },
      {
        input: { growLogId: growLog.id, question: "Question" },
        selectedLog: { ...growLog, stage: "fruiting" as never },
      },
      {
        input: { growLogId: growLog.id, question: "Question" },
        selectedLog: { ...growLog, body: "No details recorded about appearance or timing." },
      },
    ];

    for (const testCase of cases) {
      const dependencies = createDependencies(
        "selectedLog" in testCase ? { getGrowLog: vi.fn().mockResolvedValue(testCase.selectedLog) } : {},
      );
      await diagnoseSelectedLog(client, "owner-1", testCase.input, dependencies);
      expect(dependencies.acquireAdmission).not.toHaveBeenCalled();
      expect(dependencies.provider.createQueryEmbedding).not.toHaveBeenCalled();
    }
  });

  it("consumes an admitted provider timeout and always releases its active claim", async () => {
    const dependencies = createDependencies({
      provider: {
        createQueryEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
        generateDiagnosis: vi.fn().mockRejectedValue(new DiagnosisError("provider_timeout", "Provider timed out.")),
      },
    });

    const response = await diagnoseSelectedLog(
      client,
      "owner-1",
      { growLogId: growLog.id, question: "Is this plate stalled?" },
      dependencies,
    );

    expect(response.ok ? null : response.error.code).toBe("provider_timeout");
    expect(dependencies.acquireAdmission).toHaveBeenCalledTimes(1);
    expect(dependencies.releaseAdmission).toHaveBeenCalledWith(client, "claim-1");
  });
});
