import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  MAX_PULL_REQUEST_PATCH_BYTES,
  pullRequestReviewRequestSchema,
  type PullRequestChangedFile,
  type PullRequestReviewRequest,
} from "./schema.js";
import { OperationalError } from "./operational-error.js";

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

export interface PullRequestIdentity {
  repository: string;
  pullRequestNumber: number;
  headSha: string;
  retry: boolean;
}

function inputError(internalMessage: string, cause?: unknown): OperationalError {
  return new OperationalError({ code: "INPUT_EVENT_INVALID", stage: "input-validation" }, { cause, internalMessage });
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw inputError(`GitHub event is missing ${name}.`);
  }
  return value;
}

async function readPullRequestEvent(
  eventPath: string,
  readEvent: (eventPath: string) => Promise<string>,
): Promise<PullRequestEvent> {
  try {
    return JSON.parse(await readEvent(eventPath)) as PullRequestEvent;
  } catch (cause) {
    throw inputError("GitHub event file is not valid JSON.", cause);
  }
}

function pullRequestIdentity(event: PullRequestEvent): PullRequestIdentity {
  if (!SUPPORTED_ACTIONS.has(event.action ?? "") || !event.pull_request)
    throw inputError("GitHub event is not an in-scope pull request action.");
  const retry = event.action === "labeled";
  if (retry && event.label?.name !== "ai-cr:review") throw inputError("GitHub label event is not an AI review retry.");
  const pullRequestNumber = event.pull_request.number ?? event.number;
  if (typeof pullRequestNumber !== "number" || !Number.isInteger(pullRequestNumber) || pullRequestNumber <= 0)
    throw inputError("GitHub event is missing a valid pull request number.");

  return {
    repository: requireString(event.repository?.full_name, "repository.full_name"),
    pullRequestNumber,
    headSha: requireString(event.pull_request.head?.sha, "pull_request.head.sha"),
    retry,
  };
}

export async function createPullRequestIdentity(
  eventPath: string,
  dependencies: Pick<PullRequestInputDependencies, "readEvent"> = {},
): Promise<PullRequestIdentity> {
  const readEvent = dependencies.readEvent ?? ((path) => readFile(path, "utf8"));
  return pullRequestIdentity(await readPullRequestEvent(eventPath, readEvent));
}

function parseChangedFiles(nameStatus: string, numstat: string, raw: string): PullRequestChangedFile[] {
  const binaryPaths = new Set<string>();
  const numstatRecords = numstat.split("\0");
  for (let index = 0; index < numstatRecords.length; index += 1) {
    const record = numstatRecords[index];
    if (!record) continue;
    const firstTab = record.indexOf("\t");
    const secondTab = record.indexOf("\t", firstTab + 1);
    if (firstTab < 0 || secondTab < 0) throw new Error("Git returned malformed numstat metadata.");
    const added = record.slice(0, firstTab);
    const deleted = record.slice(firstTab + 1, secondTab);
    let path = record.slice(secondTab + 1);
    if (path === "") {
      if (index + 2 >= numstatRecords.length) throw new Error("Git returned malformed numstat rename metadata.");
      index += 1;
      index += 1;
      path = numstatRecords[index];
    }
    if (added === "-" && deleted === "-") binaryPaths.add(path);
  }

  const records = nameStatus.split("\0").filter(Boolean);
  const submodulePaths = new Set<string>();
  const rawRecords = raw.split("\0");
  for (let index = 0; index < rawRecords.length; index += 1) {
    const header = rawRecords[index];
    if (!header) continue;
    const match = /^:(\d{6}) (\d{6}) [0-9a-f]+ [0-9a-f]+ ([A-Z])\d*$/iu.exec(header);
    if (!match) throw new Error("Git returned malformed raw diff metadata.");
    if (index + 1 >= rawRecords.length) throw new Error("Git returned malformed raw path metadata.");
    const [, oldMode, newMode, status] = match;
    index += 1;
    let path = rawRecords[index];
    if (status === "R" || status === "C") {
      if (index + 1 >= rawRecords.length) throw new Error("Git returned malformed raw rename metadata.");
      index += 1;
      path = rawRecords[index];
    }
    if (oldMode === "160000" || newMode === "160000") submodulePaths.add(path);
  }
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
  const event = await readPullRequestEvent(eventPath, readEvent);
  const identity = pullRequestIdentity(event);
  const pullRequest = event.pull_request;
  if (!pullRequest) throw inputError("GitHub event is not an in-scope pull request action.");

  const base = requireString(pullRequest.base?.sha, "pull_request.base.sha");
  const head = identity.headSha;
  let mergeBase: string;
  let nameStatus: string;
  let numstat: string;
  let raw: string;
  let patch: string;
  try {
    mergeBase = (await runGit(["merge-base", base, head], repositoryRoot)).trim();
    const range = `${mergeBase}..${head}`;
    [nameStatus, numstat, raw, patch] = await Promise.all([
      runGit(["diff", "--name-status", "-z", range], repositoryRoot),
      runGit(["diff", "--numstat", "-z", range], repositoryRoot),
      runGit(["diff", "--raw", "-z", range], repositoryRoot),
      runGit(["diff", "--submodule=log", range], repositoryRoot),
    ]);
  } catch (cause) {
    throw new OperationalError(
      { code: "DIFF_ACQUISITION_FAILED", stage: "diff-acquisition" },
      { cause, internalMessage: "Git could not build the pull request diff." },
    );
  }
  if (patch.trim() === "")
    throw new OperationalError(
      { code: "DIFF_EMPTY", stage: "diff-acquisition" },
      { internalMessage: "Pull request patch is empty." },
    );
  if (Buffer.byteLength(patch, "utf8") > MAX_PULL_REQUEST_PATCH_BYTES)
    throw new OperationalError(
      {
        code: "DIFF_TOO_LARGE",
        stage: "diff-acquisition",
        actualBytes: Buffer.byteLength(patch, "utf8"),
        limitBytes: MAX_PULL_REQUEST_PATCH_BYTES,
      },
      { internalMessage: "Pull request patch exceeds the 100 KiB limit." },
    );
  return pullRequestReviewRequestSchema.parse({
    repository: identity.repository,
    pullRequestNumber: identity.pullRequestNumber,
    baseSha: mergeBase,
    headSha: head,
    title: requireString(pullRequest.title, "pull_request.title"),
    body: pullRequest.body,
    changedFiles: parseChangedFiles(nameStatus, numstat, raw),
    patch,
    retry: identity.retry,
  });
}
