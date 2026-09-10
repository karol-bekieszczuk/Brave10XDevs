import { lstat, readFile, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { tool } from "ai";
import { z } from "zod";

const MAX_FILE_BYTES = 256 * 1024;
const MAX_MATCHES = 50;
const MAX_MATCH_TEXT_LENGTH = 1_000;
const IGNORED_DIRECTORIES = new Set([".git", "node_modules", "dist"]);

const repositoryContextSchema = z
  .object({
    repositoryRoot: z.string().trim().min(1),
  })
  .strict();

const readFileInputSchema = z
  .object({
    path: z.string().trim().min(1).max(500).describe("Repository-relative path to a text file."),
  })
  .strict();

const searchTextInputSchema = z
  .object({
    query: z.string().min(1).max(500).describe("Case-sensitive literal text to find."),
    subtree: z.string().trim().min(1).max(500).optional().describe("Optional repository-relative directory."),
  })
  .strict();

interface RepositoryContext {
  repositoryRoot: string;
}

interface ReadFileInput {
  path: string;
}

interface SearchTextInput {
  query: string;
  subtree?: string;
}

interface SearchMatch {
  filePath: string;
  line: number;
  text: string;
}

class RepositoryToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepositoryToolError";
  }
}

function reject(message: string): never {
  throw new RepositoryToolError(message);
}

function normalizeRelativePath(input: string, label: string): string {
  const value = input.trim();

  if (!value) {
    reject(`${label} must not be empty.`);
  }

  if (value.includes("\0")) {
    reject(`${label} contains an invalid character.`);
  }

  if (path.isAbsolute(value) || path.win32.isAbsolute(value) || path.posix.isAbsolute(value)) {
    reject(`${label} must be repository-relative; absolute paths are not allowed.`);
  }

  if (value.split(/[\\/]+/u).includes("..")) {
    reject(`${label} must stay inside the repository; parent traversal is not allowed.`);
  }

  return value;
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

async function resolveRepositoryRoot(repositoryRoot: string): Promise<string> {
  try {
    const resolved = await realpath(path.resolve(repositoryRoot));
    const metadata = await stat(resolved);
    if (!metadata.isDirectory()) {
      reject("Repository root must be a directory.");
    }
    return resolved;
  } catch (error) {
    if (error instanceof RepositoryToolError) {
      throw error;
    }
    reject("Repository root is unavailable.");
  }
}

async function resolveSafePath(root: string, requestedPath: string, label: string): Promise<string> {
  const relativePath = normalizeRelativePath(requestedPath, label);
  const candidate = path.resolve(root, relativePath);

  if (!isInside(root, candidate)) {
    reject(`${label} must stay inside the repository.`);
  }

  const segments = path.relative(root, candidate).split(path.sep).filter(Boolean);
  let current = root;

  try {
    for (const segment of segments) {
      current = path.join(current, segment);
      if ((await lstat(current)).isSymbolicLink()) {
        reject(`${label} must not traverse a symbolic link.`);
      }
    }

    const resolved = await realpath(candidate);
    if (!isInside(root, resolved)) {
      reject(`${label} resolves outside the repository.`);
    }
    return resolved;
  } catch (error) {
    if (error instanceof RepositoryToolError) {
      throw error;
    }
    reject(`${label} does not exist or cannot be accessed.`);
  }
}

function isBinary(content: Buffer): boolean {
  return content.includes(0);
}

function toRepositoryPath(root: string, filePath: string): string {
  return path.relative(root, filePath).split(path.sep).join("/");
}

function matchExcerpt(line: string, query: string): string {
  if (line.length <= MAX_MATCH_TEXT_LENGTH) {
    return line;
  }

  const matchIndex = line.indexOf(query);
  const start = Math.max(0, matchIndex - Math.floor((MAX_MATCH_TEXT_LENGTH - query.length) / 2));
  return line.slice(start, start + MAX_MATCH_TEXT_LENGTH);
}

export async function readRepositoryFile(
  input: ReadFileInput,
  context: RepositoryContext,
): Promise<{ filePath: string; content: string }> {
  const validatedInput = readFileInputSchema.parse(input);
  const validatedContext = repositoryContextSchema.parse(context);
  const root = await resolveRepositoryRoot(validatedContext.repositoryRoot);
  const filePath = await resolveSafePath(root, validatedInput.path, "File path");

  let metadata;
  try {
    metadata = await stat(filePath);
  } catch {
    reject("File path does not exist or cannot be accessed.");
  }

  if (!metadata.isFile()) {
    reject("File path must identify a regular file.");
  }
  if (metadata.size > MAX_FILE_BYTES) {
    reject("File exceeds the 256 KiB read limit.");
  }

  let content: Buffer;
  try {
    content = await readFile(filePath);
  } catch {
    reject("File could not be read.");
  }

  if (content.byteLength > MAX_FILE_BYTES) {
    reject("File exceeds the 256 KiB read limit.");
  }
  if (isBinary(content)) {
    reject("File appears to be binary; only text files can be read.");
  }

  return {
    filePath: toRepositoryPath(root, filePath),
    content: content.toString("utf8"),
  };
}

async function collectFiles(directory: string, files: string[]): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      continue;
    }

    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name)) {
        await collectFiles(entryPath, files);
      }
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
}

export async function searchRepositoryText(
  input: SearchTextInput,
  context: RepositoryContext,
): Promise<{ matches: SearchMatch[]; truncated: boolean }> {
  const validatedInput = searchTextInputSchema.parse(input);
  const validatedContext = repositoryContextSchema.parse(context);
  const root = await resolveRepositoryRoot(validatedContext.repositoryRoot);
  const subtree = await resolveSafePath(root, validatedInput.subtree ?? ".", "Search subtree");

  let subtreeMetadata;
  try {
    subtreeMetadata = await stat(subtree);
  } catch {
    reject("Search subtree does not exist or cannot be accessed.");
  }

  if (!subtreeMetadata.isDirectory()) {
    reject("Search subtree must identify a directory.");
  }

  const files: string[] = [];
  try {
    await collectFiles(subtree, files);
  } catch {
    reject("Search subtree could not be read.");
  }

  const matches: SearchMatch[] = [];
  let truncated = false;

  for (const filePath of files) {
    let metadata;
    let content: Buffer;
    try {
      metadata = await stat(filePath);
      if (metadata.size > MAX_FILE_BYTES) {
        continue;
      }
      content = await readFile(filePath);
    } catch {
      continue;
    }

    if (content.byteLength > MAX_FILE_BYTES || isBinary(content)) {
      continue;
    }

    const lines = content.toString("utf8").split(/\r?\n/u);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? "";
      if (!line.includes(validatedInput.query)) {
        continue;
      }
      if (matches.length === MAX_MATCHES) {
        truncated = true;
        return { matches, truncated };
      }
      matches.push({
        filePath: toRepositoryPath(root, filePath),
        line: index + 1,
        text: matchExcerpt(line, validatedInput.query),
      });
    }
  }

  return { matches, truncated };
}

export const repositoryTools = {
  readFile: tool({
    description: "Read one bounded text file using a repository-relative path.",
    inputSchema: readFileInputSchema,
    contextSchema: repositoryContextSchema,
    execute: (input, { context }) => readRepositoryFile(input, context),
  }),
  searchText: tool({
    description: "Search for case-sensitive literal text in repository files without following symbolic links.",
    inputSchema: searchTextInputSchema,
    contextSchema: repositoryContextSchema,
    execute: (input, { context }) => searchRepositoryText(input, context),
  }),
};
