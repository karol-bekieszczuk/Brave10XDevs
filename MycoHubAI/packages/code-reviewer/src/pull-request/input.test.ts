import { describe, expect, it } from "vitest";
import { createPullRequestReviewRequest } from "./input.js";

const base = "a".repeat(40);
const head = "b".repeat(40);
const event = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    action: "synchronize",
    repository: { full_name: "Brave10XDevs/MycoHubAI" },
    pull_request: { number: 12, title: "Review me", body: "body", base: { sha: base }, head: { sha: head } },
    ...overrides,
  });
function dependencies(patch = "diff --git a/a b/a\n+text", status = "M\0src/a.ts\0", numstat = "1\t1\tsrc/a.ts\n") {
  return {
    readEvent: () => Promise.resolve(event()),
    runGit: (args: string[]) =>
      Promise.resolve(
        args[1] === "--name-status"
          ? status
          : args[1] === "--numstat"
            ? numstat
            : args[0] === "merge-base"
              ? base
              : patch,
      ),
  };
}

describe("pull request input", () => {
  it("builds a bounded request including deleted and binary file metadata", async () => {
    const request = await createPullRequestReviewRequest(
      "event.json",
      "repo",
      dependencies("patch", "D\0old.ts\0M\0image.png\0", "0\t3\told.ts\n-\t-\timage.png\n"),
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
});
