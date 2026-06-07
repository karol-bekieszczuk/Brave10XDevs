export type DiagnosisKnowledgeStage = "agar" | "grain";

export interface DiagnosisKnowledgeChunk {
  id: string;
  sourcePath: string;
  sourceHeading: string | null;
  stage: DiagnosisKnowledgeStage;
  content: string;
  similarity: number;
}

export interface DiagnosisKnowledgeRpcRow {
  id: string;
  source_path: string;
  source_heading: string | null;
  stage: DiagnosisKnowledgeStage;
  content: string;
  similarity: number;
}

export interface MatchDiagnosisKnowledgeParams {
  queryEmbedding: number[];
  stage: DiagnosisKnowledgeStage;
  matchThreshold?: number;
  matchCount?: number;
}

interface DiagnosisKnowledgeRpcResult {
  data: DiagnosisKnowledgeRpcRow[] | null;
  error: Error | null;
}

export interface DiagnosisRetrievalClient {
  rpc(name: "match_diagnosis_knowledge_chunks", args: Record<string, unknown>): Promise<DiagnosisKnowledgeRpcResult>;
}

export function mapDiagnosisKnowledgeChunk(row: DiagnosisKnowledgeRpcRow): DiagnosisKnowledgeChunk {
  return {
    id: row.id,
    sourcePath: row.source_path,
    sourceHeading: row.source_heading,
    stage: row.stage,
    content: row.content,
    similarity: row.similarity,
  };
}
// TODO - dial in matchThreshold
export async function matchDiagnosisKnowledgeChunks(
  client: DiagnosisRetrievalClient,
  { queryEmbedding, stage, matchThreshold = 0, matchCount = 5 }: MatchDiagnosisKnowledgeParams,
): Promise<DiagnosisKnowledgeChunk[]> {
  const { data, error } = await client.rpc("match_diagnosis_knowledge_chunks", {
    query_embedding: queryEmbedding,
    stage_filter: stage,
    match_threshold: matchThreshold,
    match_count: matchCount,
  });

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapDiagnosisKnowledgeChunk);
}
