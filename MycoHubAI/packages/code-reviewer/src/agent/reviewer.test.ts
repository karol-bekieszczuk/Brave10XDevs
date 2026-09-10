import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createReviewer } from "./reviewer.js";

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

function textResult(text: string) {
  return {
    content: [{ type: "text" as const, text }],
    finishReason: { unified: "stop" as const, raw: undefined },
    usage,
    warnings: [],
  };
}

describe("reviewer agent", () => {
  let fixtureBase: string | undefined;

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.resetModules();
    if (fixtureBase) {
      await rm(fixtureBase, { recursive: true, force: true });
      fixtureBase = undefined;
    }
  });

  it("returns a schema-validated direct structured result with an injected model", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: textResult(
        '{"findings":[{"severity":"warning","filePath":"src/example.ts","line":2,"message":"The error is ignored."}]}',
      ),
    });

    await expect(
      createReviewer(model).generate({ prompt: "Review this repository.", repositoryRoot: process.cwd() }),
    ).resolves.toEqual({
      findings: [
        {
          severity: "warning",
          filePath: "src/example.ts",
          line: 2,
          message: "The error is ignored.",
        },
      ],
    });
    expect(model.doGenerateCalls).toHaveLength(1);
  });

  it("uses one tool round and returns structured findings in the second step", async () => {
    fixtureBase = await mkdtemp(path.join(tmpdir(), "code-reviewer-agent-"));
    const repositoryRoot = path.join(fixtureBase, "repository");
    await mkdir(path.join(repositoryRoot, "src"), { recursive: true });
    await writeFile(path.join(repositoryRoot, "src", "example.ts"), "const ignoredError = true;\n");

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
        textResult(
          '{"findings":[{"severity":"error","filePath":"src/example.ts","line":1,"message":"The known error is ignored."}]}',
        ),
      ],
    });

    const result = await createReviewer(model).generate({ prompt: "Find the known issue.", repositoryRoot });

    expect(result.findings[0]).toMatchObject({ filePath: "src/example.ts", line: 1 });
    expect(model.doGenerateCalls).toHaveLength(2);
  });

  it("rejects invalid structured output instead of returning unchecked data", async () => {
    const model = new MockLanguageModelV4({ doGenerate: textResult('{"findings":[{"severity":"info"}]}') });

    await expect(
      createReviewer(model).generate({ prompt: "Review this repository.", repositoryRoot: process.cwd() }),
    ).rejects.toThrow();
  });

  it("stops after two tool-calling steps instead of accepting a third round", async () => {
    const toolCall = {
      content: [{ type: "tool-call" as const, toolCallId: "search-1", toolName: "searchText", input: '{"query":"x"}' }],
      finishReason: { unified: "tool-calls" as const, raw: undefined },
      usage,
      warnings: [],
    };
    const model = new MockLanguageModelV4({
      doGenerate: [toolCall, { ...toolCall, content: [{ ...toolCall.content[0], toolCallId: "search-2" }] }],
    });

    await expect(
      createReviewer(model).generate({ prompt: "Keep searching.", repositoryRoot: process.cwd() }),
    ).rejects.toThrow();
    expect(model.doGenerateCalls).toHaveLength(2);
  });

  it("imports the default reviewer without an API key or model request", async () => {
    vi.resetModules();
    vi.stubEnv("OPENROUTER_API_KEY", "");

    await expect(import("./reviewer.js")).resolves.toHaveProperty("reviewer");
  });
});
