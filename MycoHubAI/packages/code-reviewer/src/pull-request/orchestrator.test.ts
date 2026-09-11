import { describe, expect, it, vi } from "vitest";
import { runPullRequestOrchestrator } from "./orchestrator.js";
import type { PullRequestReviewRequest, PullRequestReviewResult } from "./schema.js";

const request: PullRequestReviewRequest = {
  repository: "Brave10XDevs/MycoHubAI",
  pullRequestNumber: 2,
  baseSha: "a".repeat(40),
  headSha: "b".repeat(40),
  title: "t",
  body: "",
  changedFiles: [{ path: "a.ts", changeType: "modified", binary: false, submodule: false }],
  patch: "patch",
  retry: true,
};
const result: PullRequestReviewResult = {
  reviewedCommitSha: request.headSha,
  criteria: {
    documentation: { score: 8, rationale: "r", evidence: [{ filePath: "a.ts", description: "d" }] },
    testCoverage: { score: 8, rationale: "r", evidence: [{ filePath: "a.ts", description: "d" }] },
    testQuality: { score: 8, rationale: "r", evidence: [{ filePath: "a.ts", description: "d" }] },
  },
  findings: [],
};
function github(head = request.headSha) {
  return {
    findMarkedComment: vi.fn().mockResolvedValue(undefined),
    createComment: vi.fn().mockResolvedValue(undefined),
    updateComment: vi.fn().mockResolvedValue(undefined),
    getCurrentHeadSha: vi.fn().mockResolvedValue(head),
    getLabels: vi.fn().mockResolvedValue(["bug", "ai-cr:review"]),
    ensureLabel: vi.fn().mockResolvedValue(undefined),
    addLabel: vi.fn().mockResolvedValue(undefined),
    removeLabel: vi.fn().mockResolvedValue(undefined),
  };
}
describe("PR orchestrator", () => {
  it("consumes retry, publishes one marked result, and preserves unrelated labels", async () => {
    const client = github();
    const output = await runPullRequestOrchestrator({
      acquireRequest: () => Promise.resolve(request),
      reviewer: { generate: () => Promise.resolve(result) },
      github: client,
      repositoryRoot: "repo",
    });
    expect(output).toEqual({ status: "passed", exitCode: 0 });
    expect(client.removeLabel).toHaveBeenCalledWith("ai-cr:review");
    expect(client.removeLabel).not.toHaveBeenCalledWith("bug");
    expect(client.addLabel).toHaveBeenCalledWith("ai-cr:passed");
    expect(client.createComment).toHaveBeenCalledTimes(1);
  });
  it("updates the existing marked bot comment instead of creating a duplicate", async () => {
    const client = github();
    client.findMarkedComment.mockResolvedValue({ id: 41, body: "<!-- mycohub-ai-pr-review -->", userType: "Bot" });
    await runPullRequestOrchestrator({
      acquireRequest: () => Promise.resolve(request),
      reviewer: { generate: () => Promise.resolve(result) },
      github: client,
      repositoryRoot: "repo",
    });
    expect(client.updateComment).toHaveBeenCalledWith(41, expect.stringContaining("<!-- mycohub-ai-pr-review -->"));
    expect(client.createComment).not.toHaveBeenCalled();
  });
  it("rejects stale heads without publishing", async () => {
    const client = github("c".repeat(40));
    const output = await runPullRequestOrchestrator({
      acquireRequest: () => Promise.resolve(request),
      reviewer: { generate: () => Promise.resolve(result) },
      github: client,
      repositoryRoot: "repo",
    });
    expect(output.stale).toBe(true);
    expect(client.createComment).not.toHaveBeenCalled();
    expect(client.updateComment).not.toHaveBeenCalled();
    expect(client.ensureLabel).not.toHaveBeenCalled();
    expect(client.addLabel).not.toHaveBeenCalled();
  });
  it("returns a non-zero error for a reviewer failure", async () => {
    const client = github();
    const secrets = 'Bearer top-secret token=also-secret {"apiKey":"third-secret"}';
    const output = await runPullRequestOrchestrator({
      acquireRequest: () => Promise.resolve(request),
      reviewer: { generate: () => Promise.reject(new Error(secrets)) },
      github: client,
      repositoryRoot: "repo",
      runUrl: "https://github.com/Brave10XDevs/MycoHubAI/actions/runs/123",
    });
    expect(output).toEqual({ status: "error", exitCode: 1 });
    const comment = client.createComment.mock.calls[0]?.[0] as string;
    expect(comment).toContain("`INTERNAL_ERROR`");
    expect(comment).toContain("actions/runs/123");
    expect(comment).not.toContain("top-secret");
    expect(comment).not.toContain("also-secret");
    expect(comment).not.toContain("third-secret");
  });
});
