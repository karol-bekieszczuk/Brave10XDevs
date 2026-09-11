import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPullRequestReviewer } from "./reviewer.js";
import { pullRequestReviewRequestSchema } from "./schema.js";

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

const headSha = "b".repeat(40);
const request = pullRequestReviewRequestSchema.parse({
  repository: "Brave10XDevs/MycoHubAI",
  pullRequestNumber: 42,
  baseSha: "a".repeat(40),
  headSha,
  title: "Add review contract",
  body: "A bounded body",
  changedFiles: [{ path: "src/example.ts", changeType: "modified" }],
  patch: "+const covered = true;",
  retry: false,
});

function providerOutput() {
  const criterion = {
    score: 8,
    rationale: "The implementation and tests agree.",
    evidence: [{ filePath: "src/example.ts", line: null, description: "The public behavior is asserted." }],
  };
  return JSON.stringify({
    reviewedCommitSha: headSha,
    criteria: {
      documentation: criterion,
      testCoverage: criterion,
      testQuality: criterion,
    },
    findings: [
      {
        severity: "suggestion",
        filePath: "src/example.ts",
        line: null,
        message: "Consider a narrower name.",
        suggestion: null,
      },
    ],
  });
}

function textResult(text: string) {
  return {
    content: [{ type: "text" as const, text }],
    finishReason: { unified: "stop" as const, raw: undefined },
    usage,
    warnings: [],
  };
}

describe("pull request reviewer", () => {
  let fixtureBase: string | undefined;

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.resetModules();
    if (fixtureBase) {
      await rm(fixtureBase, { recursive: true, force: true });
      fixtureBase = undefined;
    }
  });

  it("returns a normalized schema-validated scored result from an injected model", async () => {
    const model = new MockLanguageModelV4({ doGenerate: textResult(providerOutput()) });

    await expect(
      createPullRequestReviewer(model).generate({ request, repositoryRoot: process.cwd() }),
    ).resolves.toMatchObject({
      reviewedCommitSha: headSha,
      criteria: {
        documentation: { score: 8 },
        testCoverage: { score: 8 },
        testQuality: { score: 8 },
      },
      findings: [{ severity: "suggestion", filePath: "src/example.ts" }],
    });
    expect(model.doGenerateCalls).toHaveLength(1);
    expect(JSON.stringify(model.doGenerateCalls[0]?.prompt)).toContain("BEGIN UNTRUSTED PATCH JSON");
  });

  it("reuses the repository tools for one tool round before structured output", async () => {
    fixtureBase = await mkdtemp(path.join(tmpdir(), "pr-reviewer-agent-"));
    const repositoryRoot = path.join(fixtureBase, "repository");
    await mkdir(path.join(repositoryRoot, "src"), { recursive: true });
    await writeFile(path.join(repositoryRoot, "src", "example.ts"), "export const covered = true;\n");

    const model = new MockLanguageModelV4({
      doGenerate: [
        {
          content: [
            {
              type: "tool-call" as const,
              toolCallId: "read-1",
              toolName: "readFile",
              input: '{"path":"src/example.ts"}',
            },
          ],
          finishReason: { unified: "tool-calls" as const, raw: undefined },
          usage,
          warnings: [],
        },
        textResult(providerOutput()),
      ],
    });

    await expect(createPullRequestReviewer(model).generate({ request, repositoryRoot })).resolves.toHaveProperty(
      "reviewedCommitSha",
      headSha,
    );
    expect(model.doGenerateCalls).toHaveLength(2);
  });

  it("rejects malformed scored output", async () => {
    const model = new MockLanguageModelV4({ doGenerate: textResult('{"reviewedCommitSha":"invalid"}') });

    await expect(
      createPullRequestReviewer(model).generate({ request, repositoryRoot: process.cwd() }),
    ).rejects.toThrow();
  });

  it("rejects a valid result for a commit other than the requested head", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: textResult(providerOutput().replace(headSha, "c".repeat(40))),
    });

    await expect(createPullRequestReviewer(model).generate({ request, repositoryRoot: process.cwd() })).rejects.toThrow(
      "does not match the requested head commit",
    );
  });

  it("imports without validating a provider credential or making a model request", async () => {
    vi.resetModules();
    vi.stubEnv("OPENROUTER_API_KEY", "");

    await expect(import("./reviewer.js")).resolves.toHaveProperty("createPullRequestReviewer");
  });
});
