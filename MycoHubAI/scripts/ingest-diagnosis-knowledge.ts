import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { embedMany } from "ai";
import { openai } from "@ai-sdk/openai";
import { createClient } from "@supabase/supabase-js";

const KNOWLEDGE_DIR = path.resolve("lib", "diagnosis", "knowledge");
const EMBEDDING_MODEL = "text-embedding-3-small";
const MAX_CHUNK_CHARS = 1800;

type DiagnosisStage = "agar" | "grain";

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
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const supabaseServiceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  requireEnv("OPENAI_API_KEY");

  const chunks = await readKnowledgeChunks();

  if (chunks.length === 0) {
    throw new Error(`No Markdown knowledge chunks found in ${KNOWLEDGE_DIR}.`);
  }

  const { embeddings } = await embedMany({
    model: openai.embedding(EMBEDDING_MODEL),
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

  console.log(`Ingested ${rows.length} diagnosis knowledge chunk(s).`);
}

await main();
