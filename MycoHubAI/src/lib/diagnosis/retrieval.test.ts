import { describe, expect, it } from "vitest";
import {
  mapDiagnosisKnowledgeChunk,
  matchDiagnosisKnowledgeChunks,
  type DiagnosisKnowledgeRpcRow,
  type DiagnosisRetrievalClient,
} from "./retrieval";

interface RpcResult {
  data: DiagnosisKnowledgeRpcRow[] | null;
  error: Error | null;
}

function createMockClient(result: RpcResult) {
  const calls: { name: string; args: unknown }[] = [];

  const client = {
    rpc(name: string, args: unknown) {
      calls.push({ name, args });
      return Promise.resolve(result);
    },
  } satisfies DiagnosisRetrievalClient;

  return { calls, client };
}

const rpcRow: DiagnosisKnowledgeRpcRow = {
  id: "chunk-1",
  source_path: "lib/diagnosis/knowledge/agar-contamination.md",
  source_heading: "Fast spreading non-mycelial growth",
  stage: "agar",
  content: "Green patches away from the transfer point are concerning.",
  similarity: 0.83,
};

describe("diagnosis retrieval", () => {
  it("maps snake_case RPC source metadata into camelCase app fields", () => {
    expect(mapDiagnosisKnowledgeChunk(rpcRow)).toEqual({
      id: "chunk-1",
      sourcePath: "lib/diagnosis/knowledge/agar-contamination.md",
      sourceHeading: "Fast spreading non-mycelial growth",
      stage: "agar",
      content: "Green patches away from the transfer point are concerning.",
      similarity: 0.83,
    });
  });

  it("calls only the stage-scoped diagnosis knowledge RPC", async () => {
    const { calls, client } = createMockClient({ data: [rpcRow], error: null });

    const result = await matchDiagnosisKnowledgeChunks(client, {
      queryEmbedding: [0.1, 0.2, 0.3],
      stage: "agar",
      matchThreshold: 0.7,
      matchCount: 3,
    });

    expect(result).toEqual([mapDiagnosisKnowledgeChunk(rpcRow)]);
    expect(calls).toEqual([
      {
        name: "match_diagnosis_knowledge_chunks",
        args: {
          query_embedding: [0.1, 0.2, 0.3],
          stage_filter: "agar",
          match_threshold: 0.7,
          match_count: 3,
        },
      },
    ]);
  });

  it("uses bounded defaults when optional retrieval controls are omitted", async () => {
    const { calls, client } = createMockClient({ data: [], error: null });

    await matchDiagnosisKnowledgeChunks(client, {
      queryEmbedding: [0.1],
      stage: "grain",
    });

    expect(calls).toEqual([
      {
        name: "match_diagnosis_knowledge_chunks",
        args: {
          query_embedding: [0.1],
          stage_filter: "grain",
          match_threshold: 0,
          match_count: 5,
        },
      },
    ]);
  });

  it("throws controlled Supabase RPC errors to the service boundary", async () => {
    const error = new Error("rpc failed");
    const { client } = createMockClient({ data: null, error });

    await expect(
      matchDiagnosisKnowledgeChunks(client, {
        queryEmbedding: [0.1],
        stage: "agar",
      }),
    ).rejects.toThrow("rpc failed");
  });
});
