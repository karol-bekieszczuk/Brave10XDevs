import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { createPullRequestIdentity, createPullRequestReviewRequest } from "./input.js";

const executeFile = promisify(execFile);

async function git(repositoryRoot: string, ...args: string[]): Promise<string> {
  return (await executeFile("git", args, { cwd: repositoryRoot, windowsHide: true })).stdout.trim();
}

const base = "a".repeat(40);
const head = "b".repeat(40);
const event = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    action: "synchronize",
    repository: { full_name: "Brave10XDevs/MycoHubAI" },
    pull_request: { number: 12, title: "Review me", body: "body", base: { sha: base }, head: { sha: head } },
    ...overrides,
  });
function dependencies(
  patch = "diff --git a/a b/a\n+text",
  status = "M\0src/a.ts\0",
  numstat = "1\t1\tsrc/a.ts\0",
  raw = ":100644 100644 aaaaaaa bbbbbbb M\0src/a.ts\0",
) {
  return {
    readEvent: () => Promise.resolve(event()),
    runGit: (args: string[]) =>
      Promise.resolve(
        args[1] === "--name-status"
          ? status
          : args[1] === "--numstat"
            ? numstat
            : args[1] === "--raw"
              ? raw
              : args[0] === "merge-base"
                ? base
                : patch,
      ),
  };
}

describe("pull request input", () => {
  it("extracts the minimal PR identity without invoking Git", async () => {
    await expect(
      createPullRequestIdentity("event.json", { readEvent: () => Promise.resolve(event()) }),
    ).resolves.toEqual({
      repository: "Brave10XDevs/MycoHubAI",
      pullRequestNumber: 12,
      headSha: head,
      retry: false,
    });
  });
  it("builds a bounded request including deleted and binary file metadata", async () => {
    const request = await createPullRequestReviewRequest(
      "event.json",
      "repo",
      dependencies(
        "patch",
        "D\0old.ts\0M\0image.png\0",
        "0\t3\told.ts\0-\t-\timage.png\0",
        ":100644 000000 aaaaaaa 0000000 D\0old.ts\0:100644 100644 aaaaaaa bbbbbbb M\0image.png\0",
      ),
    );
    expect(request).toMatchObject({
      baseSha: base,
      headSha: head,
      changedFiles: [
        { path: "old.ts", changeType: "deleted" },
        { path: "image.png", binary: true },
      ],
    });
  });
  it("preserves NUL-delimited rename paths containing tabs and newlines", async () => {
    const previousPath = "src/old\tname.ts";
    const path = "src/new\nname.ts";
    const request = await createPullRequestReviewRequest(
      "event.json",
      "repo",
      dependencies(
        "patch",
        `R100\0${previousPath}\0${path}\0`,
        `1\t2\t\0${previousPath}\0${path}\0`,
        `:100644 100644 aaaaaaa bbbbbbb R100\0${previousPath}\0${path}\0`,
      ),
    );

    expect(request.changedFiles).toEqual([
      { path, previousPath, changeType: "renamed", binary: false, submodule: false },
    ]);
  });
  it("represents a real binary file without embedding its binary patch payload", async () => {
    const repositoryRoot = await mkdtemp(join(tmpdir(), "code-reviewer-binary-"));
    try {
      await git(repositoryRoot, "init");
      await git(repositoryRoot, "config", "user.email", "code-reviewer@example.invalid");
      await git(repositoryRoot, "config", "user.name", "Code Reviewer Test");
      await writeFile(join(repositoryRoot, "base.txt"), "base\n");
      await git(repositoryRoot, "add", "base.txt");
      await git(repositoryRoot, "commit", "-m", "base");
      const baseSha = await git(repositoryRoot, "rev-parse", "HEAD");

      await writeFile(join(repositoryRoot, "image.bin"), Buffer.from([0, 1, 2, 3, 255, 0, 128]));
      await git(repositoryRoot, "add", "image.bin");
      await git(repositoryRoot, "commit", "-m", "add binary fixture");
      const headSha = await git(repositoryRoot, "rev-parse", "HEAD");
      const eventPath = join(repositoryRoot, "event.json");
      await writeFile(
        eventPath,
        event({
          pull_request: {
            number: 12,
            title: "Binary change",
            body: "",
            base: { sha: baseSha },
            head: { sha: headSha },
          },
        }),
      );

      const request = await createPullRequestReviewRequest(eventPath, repositoryRoot);

      expect(request.changedFiles).toContainEqual({
        path: "image.bin",
        changeType: "added",
        binary: true,
        submodule: false,
      });
      expect(request.patch).toContain("Binary files");
      expect(request.patch).not.toContain("GIT binary patch");
      expect(request.patch).not.toContain("literal ");
    } finally {
      await rm(repositoryRoot, { recursive: true, force: true });
    }
  });
  it("detects added, modified, and deleted gitlinks from a real repository", async () => {
    const repositoryRoot = await mkdtemp(join(tmpdir(), "code-reviewer-gitlink-"));
    const eventPath = join(repositoryRoot, "event.json");
    const requestFor = async (baseSha: string, headSha: string) => {
      await writeFile(
        eventPath,
        event({
          pull_request: {
            number: 12,
            title: "Gitlink change",
            body: "",
            base: { sha: baseSha },
            head: { sha: headSha },
          },
        }),
      );
      return createPullRequestReviewRequest(eventPath, repositoryRoot);
    };

    try {
      await git(repositoryRoot, "init");
      await git(repositoryRoot, "config", "user.email", "code-reviewer@example.invalid");
      await git(repositoryRoot, "config", "user.name", "Code Reviewer Test");
      await writeFile(join(repositoryRoot, "base.txt"), "base\n");
      await git(repositoryRoot, "add", "base.txt");
      await git(repositoryRoot, "commit", "-m", "base");
      const baseSha = await git(repositoryRoot, "rev-parse", "HEAD");

      await git(repositoryRoot, "update-index", "--add", "--cacheinfo", "160000", baseSha, "deps/library");
      await git(repositoryRoot, "commit", "-m", "add gitlink");
      const addedSha = await git(repositoryRoot, "rev-parse", "HEAD");
      const added = await requestFor(baseSha, addedSha);
      expect(added.changedFiles).toContainEqual({
        path: "deps/library",
        changeType: "added",
        binary: false,
        submodule: true,
      });

      await git(repositoryRoot, "update-index", "--cacheinfo", "160000", addedSha, "deps/library");
      await git(repositoryRoot, "commit", "-m", "modify gitlink");
      const modifiedSha = await git(repositoryRoot, "rev-parse", "HEAD");
      const modified = await requestFor(addedSha, modifiedSha);
      expect(modified.changedFiles).toContainEqual({
        path: "deps/library",
        changeType: "modified",
        binary: false,
        submodule: true,
      });

      await git(repositoryRoot, "rm", "--cached", "deps/library");
      await git(repositoryRoot, "commit", "-m", "delete gitlink");
      const deletedSha = await git(repositoryRoot, "rev-parse", "HEAD");
      const deleted = await requestFor(modifiedSha, deletedSha);
      expect(deleted.changedFiles).toContainEqual({
        path: "deps/library",
        changeType: "deleted",
        binary: false,
        submodule: true,
      });
    } finally {
      await rm(repositoryRoot, { recursive: true, force: true });
    }
  });
  it("keeps binary metadata on the destination of a real rename", async () => {
    const repositoryRoot = await mkdtemp(join(tmpdir(), "code-reviewer-binary-rename-"));
    try {
      await git(repositoryRoot, "init");
      await git(repositoryRoot, "config", "user.email", "code-reviewer@example.invalid");
      await git(repositoryRoot, "config", "user.name", "Code Reviewer Test");
      await writeFile(join(repositoryRoot, "image.bin"), Buffer.from([0, 1, 2, 3, 255, 0, 128]));
      await git(repositoryRoot, "add", "image.bin");
      await git(repositoryRoot, "commit", "-m", "add binary");
      const baseSha = await git(repositoryRoot, "rev-parse", "HEAD");

      await git(repositoryRoot, "mv", "image.bin", "renamed.bin");
      await git(repositoryRoot, "commit", "-m", "rename binary");
      const headSha = await git(repositoryRoot, "rev-parse", "HEAD");
      const eventPath = join(repositoryRoot, "event.json");
      await writeFile(
        eventPath,
        event({
          pull_request: {
            number: 12,
            title: "Binary rename",
            body: "",
            base: { sha: baseSha },
            head: { sha: headSha },
          },
        }),
      );

      const request = await createPullRequestReviewRequest(eventPath, repositoryRoot);

      expect(request.changedFiles).toContainEqual({
        path: "renamed.bin",
        previousPath: "image.bin",
        changeType: "renamed",
        binary: true,
        submodule: false,
      });
    } finally {
      await rm(repositoryRoot, { recursive: true, force: true });
    }
  });
  it("builds the diff from the replacement head after a force-push", async () => {
    const repositoryRoot = await mkdtemp(join(tmpdir(), "code-reviewer-force-push-"));
    try {
      await git(repositoryRoot, "init");
      await git(repositoryRoot, "config", "user.email", "code-reviewer@example.invalid");
      await git(repositoryRoot, "config", "user.name", "Code Reviewer Test");
      await writeFile(join(repositoryRoot, "base.txt"), "base\n");
      await git(repositoryRoot, "add", "base.txt");
      await git(repositoryRoot, "commit", "-m", "base");
      const baseSha = await git(repositoryRoot, "rev-parse", "HEAD");

      await writeFile(join(repositoryRoot, "obsolete.txt"), "obsolete head\n");
      await git(repositoryRoot, "add", "obsolete.txt");
      await git(repositoryRoot, "commit", "-m", "obsolete head");
      await git(repositoryRoot, "checkout", "-b", "replacement", baseSha);
      await writeFile(join(repositoryRoot, "replacement.txt"), "replacement head\n");
      await git(repositoryRoot, "add", "replacement.txt");
      await git(repositoryRoot, "commit", "-m", "replacement head");
      const replacementHeadSha = await git(repositoryRoot, "rev-parse", "HEAD");
      const eventPath = join(repositoryRoot, "event.json");
      await writeFile(
        eventPath,
        event({
          action: "synchronize",
          pull_request: {
            number: 12,
            title: "Force-pushed change",
            body: "",
            base: { sha: baseSha },
            head: { sha: replacementHeadSha },
          },
        }),
      );

      const request = await createPullRequestReviewRequest(eventPath, repositoryRoot);

      expect(request.headSha).toBe(replacementHeadSha);
      expect(request.changedFiles.map(({ path }) => path)).toEqual(["replacement.txt"]);
      expect(request.patch).toContain("replacement head");
      expect(request.patch).not.toContain("obsolete head");
    } finally {
      await rm(repositoryRoot, { recursive: true, force: true });
    }
  });
  it.each([
    ["", "Pull request patch is empty"],
    ["x".repeat(102_401), "exceeds the 100 KiB"],
    ["bad", "GitHub event file is not valid JSON"],
  ])("rejects empty, oversized, and malformed inputs", async (content, message) => {
    const deps =
      content === "bad" ? { ...dependencies(), readEvent: () => Promise.resolve("{") } : dependencies(content);
    await expect(createPullRequestReviewRequest("event.json", "repo", deps)).rejects.toThrow(message);
  });
  it("accepts retry only for the command label", async () => {
    const request = await createPullRequestReviewRequest("event.json", "repo", {
      ...dependencies(),
      readEvent: () => Promise.resolve(event({ action: "labeled", label: { name: "ai-cr:review" } })),
    });
    expect(request.retry).toBe(true);
    await expect(
      createPullRequestReviewRequest("event.json", "repo", {
        ...dependencies(),
        readEvent: () => Promise.resolve(event({ action: "labeled", label: { name: "other" } })),
      }),
    ).rejects.toThrow("not an AI review retry");
  });
  it("categorizes Git failures without exposing stderr", async () => {
    const unsafe = "authorization=secret-value";
    const promise = createPullRequestReviewRequest("event.json", "repo", {
      readEvent: () => Promise.resolve(event()),
      runGit: () => Promise.reject(new Error(unsafe)),
    });

    await expect(promise).rejects.toMatchObject({
      publicFailure: { code: "DIFF_ACQUISITION_FAILED", stage: "diff-acquisition" },
    });
    await expect(promise).rejects.not.toThrow(unsafe);
  });
});
