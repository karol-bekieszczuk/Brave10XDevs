import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  MAX_PULL_REQUEST_PATCH_BYTES,
  pullRequestReviewRequestSchema,
  type PullRequestChangedFile,
  type PullRequestReviewRequest,
} from "./schema.js";

const executeFile = promisify(execFile);
const SUPPORTED_ACTIONS = new Set(["opened", "reopened", "ready_for_review", "synchronize", "labeled"]);

export interface PullRequestInputDependencies {
  readEvent?: (eventPath: string) => Promise<string>;
  runGit?: (arguments_: string[], cwd: string) => Promise<string>;
}

interface PullRequestEvent {
  action?: string;
  repository?: { full_name?: string };
  pull_request?: {
    number?: number;
    title?: string;
    body?: string | null;
    base?: { sha?: string };
    head?: { sha?: string };
  };
  number?: number;
  label?: { name?: string };
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`GitHub event is missing ${name}.`);
  }
  return value;
}

function parseChangedFiles(nameStatus: string, numstat: string, raw: string): PullRequestChangedFile[] {
  const binaryPaths = new Set(
    numstat
      .split("\n")
      .filter((line) => line.startsWith("-\t-\t"))
      .map((line) => line.split("\t").at(-1))
      .filter((path): path is string => Boolean(path)),
  );
  const records = nameStatus.split("\0").filter(Boolean);
  const submodulePaths = new Set(
    raw
      .split("\n")
      .filter((line) => line.startsWith(":160000 "))
      .map((line) => line.split("\t").at(-1))
      .filter((path): path is string => Boolean(path)),
  );
  const files: PullRequestChangedFile[] = [];

  for (let index = 0; index < records.length; index += 1) {
    const status = records[index];
    const code = status[0];
    const changeType =
      code === "A"
        ? "added"
        : code === "M"
          ? "modified"
          : code === "D"
            ? "deleted"
            : code === "R"
              ? "renamed"
              : code === "C"
                ? "copied"
                : code === "T"
                  ? "type-changed"
                  : code === "U"
                    ? "unmerged"
                    : "unknown";
    const firstPath = records[++index];
    if (!firstPath) throw new Error("Git returned malformed changed-file metadata.");
    const previousPath = code === "R" || code === "C" ? firstPath : undefined;
    const path = previousPath ? records[++index] : firstPath;
    if (!path) throw new Error("Git returned malformed rename metadata.");
    files.push({
      path,
      changeType,
      ...(previousPath ? { previousPath } : {}),
      binary: binaryPaths.has(path),
      submodule: submodulePaths.has(path),
    });
  }
  return files;
}

export async function createPullRequestReviewRequest(
  eventPath: string,
  repositoryRoot: string,
  dependencies: PullRequestInputDependencies = {},
): Promise<PullRequestReviewRequest> {
  const readEvent = dependencies.readEvent ?? ((path) => readFile(path, "utf8"));
  const runGit =
    dependencies.runGit ??
    (async (arguments_, cwd) => (await executeFile("git", arguments_, { cwd, windowsHide: true })).stdout);
  let event: PullRequestEvent;
  try {
    event = JSON.parse(await readEvent(eventPath)) as PullRequestEvent;
  } catch {
    throw new Error("GitHub event file is not valid JSON.");
  }
  if (!SUPPORTED_ACTIONS.has(event.action ?? "") || !event.pull_request)
    throw new Error("GitHub event is not an in-scope pull request action.");
  const retry = event.action === "labeled";
  if (retry && event.label?.name !== "ai-cr:review") throw new Error("GitHub label event is not an AI review retry.");

  const base = requireString(event.pull_request.base?.sha, "pull_request.base.sha");
  const head = requireString(event.pull_request.head?.sha, "pull_request.head.sha");
  const mergeBase = (await runGit(["merge-base", base, head], repositoryRoot)).trim();
  const range = `${mergeBase}..${head}`;
  const [nameStatus, numstat, raw, patch] = await Promise.all([
    runGit(["diff", "--name-status", "-z", range], repositoryRoot),
    runGit(["diff", "--numstat", range], repositoryRoot),
    runGit(["diff", "--raw", range], repositoryRoot),
    runGit(["diff", "--binary", "--submodule=log", range], repositoryRoot),
  ]);
  if (patch.trim() === "") throw new Error("Pull request patch is empty.");
  if (Buffer.byteLength(patch, "utf8") > MAX_PULL_REQUEST_PATCH_BYTES)
    throw new Error("Pull request patch exceeds the 100 KiB limit.");
  return pullRequestReviewRequestSchema.parse({
    repository: requireString(event.repository?.full_name, "repository.full_name"),
    pullRequestNumber: event.pull_request.number ?? event.number,
    baseSha: mergeBase,
    headSha: head,
    title: requireString(event.pull_request.title, "pull_request.title"),
    body: event.pull_request.body,
    changedFiles: parseChangedFiles(nameStatus, numstat, raw),
    patch,
    retry,
  });
}
