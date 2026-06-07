import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { embedMany } from "ai";
import { createClient } from "@supabase/supabase-js";

const KNOWLEDGE_DIR = path.resolve("lib", "diagnosis", "knowledge");
const KNOWLEDGE_SOURCE_PREFIX = "lib/diagnosis/knowledge/";
const EMBEDDING_MODEL = "openai/text-embedding-3-small";
const MAX_CHUNK_CHARS = 1800;
const LOCAL_DEV_VARS_PATH = path.resolve(".dev.vars");

type DiagnosisStage = "agar" | "grain";
type TextEmbeddingModel = Parameters<typeof embedMany>[0]["model"];

interface OpenRouterRuntimeEmbeddings {
  textEmbeddingModel(modelId: string): TextEmbeddingModel;
}

interface KnowledgeChunk {
  sourcePath: string;
  sourceHeading: string | null;
  stage: DiagnosisStage;
  content: string;
  chunkIndex: number;
  contentHash: string;
}

function requireEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function requireSupabaseServiceRoleKey() {
  const value = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (value.split(".").length !== 3) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY must be the Supabase service_role JWT with three dot-separated parts. For local Supabase, copy the service_role key from `npx supabase status`.",
    );
  }

  return value;
}

function createTextEmbeddingModel(provider: unknown, modelId: string) {
  return (provider as OpenRouterRuntimeEmbeddings).textEmbeddingModel(modelId);
}

function parseDevVars(content: string) {
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex <= 0) {
      throw new Error(`Invalid .dev.vars line: ${rawLine}`);
    }

    const name = line.slice(0, separatorIndex).trim();

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      throw new Error(`Invalid .dev.vars variable name: ${name}`);
    }

    let value = line.slice(separatorIndex + 1).trim();
    const quote = value[0];

    if ((quote === `"` || quote === "'") && value.endsWith(quote)) {
      value = value.slice(1, -1);
    }

    process.env[name] ??= value;
  }
}

async function loadLocalDevVars() {
  try {
    parseDevVars(await readFile(LOCAL_DEV_VARS_PATH, "utf8"));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return;
    }

    throw error;
  }
}

function parseStage(markdown: string, sourcePath: string): DiagnosisStage {
  const match = /^---\s+stage:\s*(agar|grain)\s+---/m.exec(markdown);

  if (!match) {
    throw new Error(`${sourcePath} must declare frontmatter stage: agar or stage: grain.`);
  }

  return match[1] as DiagnosisStage;
}

function stripFrontmatter(markdown: string) {
  return markdown.replace(/^---[\s\S]*?---\s*/, "").trim();
}

function splitByHeading(markdown: string) {
  const lines = markdown.split(/\r?\n/);
  const sections: { heading: string | null; content: string }[] = [];
  let heading: string | null = null;
  let current: string[] = [];

  for (const line of lines) {
    const headingMatch = /^##\s+(.+)$/.exec(line);

    if (headingMatch) {
      if (current.join("\n").trim()) {
        sections.push({ heading, content: current.join("\n").trim() });
      }

      heading = headingMatch[1].trim();
      current = [line];
      continue;
    }

    current.push(line);
  }

  if (current.join("\n").trim()) {
    sections.push({ heading, content: current.join("\n").trim() });
  }

  return sections;
}

function chunkSection(content: string) {
  if (content.length <= MAX_CHUNK_CHARS) {
    return [content];
  }

  const paragraphs = content.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph;

    if (next.length > MAX_CHUNK_CHARS && current) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = next;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function hashContent(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

function postgrestStringList(values: string[]) {
  return `(${values.map((value) => `"${value.replace(/"/g, '\\"')}"`).join(",")})`;
}

function postgrestNumberList(values: number[]) {
  return `(${values.join(",")})`;
}

async function readKnowledgeChunks() {
  const entries = await readdir(KNOWLEDGE_DIR, { withFileTypes: true });
  const chunks: KnowledgeChunk[] = [];

  for (const entry of entries.filter((item) => item.isFile() && item.name.endsWith(".md"))) {
    const absolutePath = path.join(KNOWLEDGE_DIR, entry.name);
    const sourcePath = path.posix.join("lib", "diagnosis", "knowledge", entry.name);
    const raw = await readFile(absolutePath, "utf8");
    const stage = parseStage(raw, sourcePath);
    const sections = splitByHeading(stripFrontmatter(raw));

    for (const section of sections) {
      for (const content of chunkSection(section.content)) {
        chunks.push({
          sourcePath,
          sourceHeading: section.heading,
          stage,
          content,
          chunkIndex: chunks.length,
          contentHash: hashContent(content),
        });
      }
    }
  }

  return chunks;
}

async function main() {
  await loadLocalDevVars();

  const supabaseUrl = requireEnv("SUPABASE_URL");
  const supabaseServiceRoleKey = requireSupabaseServiceRoleKey();
  const openRouterApiKey = requireEnv("OPENROUTER_API_KEY");
  const openrouter = createOpenRouter({
    apiKey: openRouterApiKey,
    appName: "MycoHubAI",
    appUrl: "https://myco-hub-ai.karol-bekieszczuk.workers.dev",
  });

  const chunks = await readKnowledgeChunks();

  if (chunks.length === 0) {
    throw new Error(`No Markdown knowledge chunks found in ${KNOWLEDGE_DIR}.`);
  }

  const { embeddings } = await embedMany({
    model: createTextEmbeddingModel(openrouter, EMBEDDING_MODEL),
    values: chunks.map((chunk) => chunk.content),
  });

  const client = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });

  const rows = chunks.map((chunk, index) => ({
    source_path: chunk.sourcePath,
    source_heading: chunk.sourceHeading,
    stage: chunk.stage,
    content: chunk.content,
    content_hash: chunk.contentHash,
    chunk_index: chunk.chunkIndex,
    embedding_model: EMBEDDING_MODEL,
    embedding: embeddings[index],
  }));

  const { error } = await client.from("diagnosis_knowledge_chunks").upsert(rows, {
    onConflict: "source_path,chunk_index",
  });

  if (error) {
    throw error;
  }

  const currentSourcePaths = [...new Set(rows.map((row) => row.source_path))];
  const { error: removedSourceError } = await client
    .from("diagnosis_knowledge_chunks")
    .delete()
    .like("source_path", `${KNOWLEDGE_SOURCE_PREFIX}%`)
    .not("source_path", "in", postgrestStringList(currentSourcePaths));

  if (removedSourceError) {
    throw removedSourceError;
  }

  for (const sourcePath of currentSourcePaths) {
    const currentChunkIndexes = rows.filter((row) => row.source_path === sourcePath).map((row) => row.chunk_index);

    const { error: staleChunkError } = await client
      .from("diagnosis_knowledge_chunks")
      .delete()
      .eq("source_path", sourcePath)
      .not("chunk_index", "in", postgrestNumberList(currentChunkIndexes));

    if (staleChunkError) {
      throw staleChunkError;
    }
  }

  console.log(`Ingested ${rows.length} diagnosis knowledge chunk(s).`);
}

await main();
