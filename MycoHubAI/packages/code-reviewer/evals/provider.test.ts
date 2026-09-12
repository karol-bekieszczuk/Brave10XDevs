import path from "node:path";
import type { LanguageModel } from "ai";
import { describe, expect, it, vi } from "vitest";
import { pullRequestReviewRequestSchema, pullRequestReviewResultSchema } from "../src/index.js";
import CodeReviewEvalProvider from "./provider.js";

const importSafetyMocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  realpath: vi.fn(),
}));

vi.mock("node:fs/promises", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs/promises")>()),
  readFile: importSafetyMocks.readFile,
  realpath: importSafetyMocks.realpath,
}));

const request = pullRequestReviewRequestSchema.parse({
  repository: "Brave10XDevs/MycoHubAI",
  pullRequestNumber: 42,
  baseSha: "a".repeat(40),
  headSha: "b".repeat(40),
  title: "Migrate the profile editor",
  body: null,
  changedFiles: [{ path: "src/UserProfileEditor.tsx", changeType: "modified" }],
  patch: "+export function UserProfileEditor() {}",
  retry: false,
});

const result = pullRequestReviewResultSchema.parse({
  reviewedCommitSha: request.headSha,
  criteria: {
    documentation: {
      score: 8,
      rationale: "No public documentation changed.",
      evidence: [{ filePath: "src/UserProfileEditor.tsx", description: "Internal component migration." }],
    },
    testCoverage: {
      score: 4,
      rationale: "A regression remains.",
      evidence: [{ filePath: "src/UserProfileEditor.tsx", line: 12, description: "State is replaced." }],
    },
    testQuality: {
      score: 6,
      rationale: "Existing tests are useful.",
      evidence: [{ filePath: "src/UserProfileEditor.tsx", description: "Behavior is observable." }],
    },
  },
  findings: [
    {
      severity: "error",
      filePath: "src/UserProfileEditor.tsx",
      line: 12,
      message: "The state update drops sibling fields.",
      suggestion: "Merge the previous state.",
    },
  ],
});

function callContext(caseId: string) {
  return { prompt: { raw: "fixture", label: "fixture" }, vars: { caseId } };
}

function dependencies(overrides: Record<string, unknown> = {}) {
  const fixtureRoot = path.resolve("C:/fixtures/cases");
  const requestPath = path.join(fixtureRoot, "react-16-to-19-profile-editor", "request.json");
  const repositoryRoot = path.join(fixtureRoot, "react-16-to-19-profile-editor", "repository");
  const generate = vi.fn().mockResolvedValue(result);
  const createReviewer = vi.fn(() => ({ generate }));
  const createModel = vi.fn(() => ({ modelId: "test-model" }) as unknown as LanguageModel);

  return {
    fixtureRoot,
    getEnvironment: vi.fn(() => ({ OPENROUTER_API_KEY: "process-secret" })),
    readFile: vi.fn().mockResolvedValue(JSON.stringify(request)),
    realpath: vi.fn((input: string) => Promise.resolve(path.resolve(input))),
    createModel,
    createReviewer,
    generate,
    requestPath,
    repositoryRoot,
    ...overrides,
  };
}

describe("Promptfoo code-review provider", () => {
  it("imports without reading fixtures, creating a model, or calling a reviewer", async () => {
    vi.resetModules();
    vi.stubEnv("OPENROUTER_API_KEY", "");

    await expect(import("./provider.js")).resolves.toHaveProperty("default");
    expect(importSafetyMocks.readFile).not.toHaveBeenCalled();
    expect(importSafetyMocks.realpath).not.toHaveBeenCalled();

    vi.unstubAllEnvs();
  });

  it("maps model and case configuration to the production reviewer and serializes safe output", async () => {
    const deps = dependencies();
    const provider = new CodeReviewEvalProvider({ config: { model: "openai/test-model" } }, deps);

    const response = await provider.callApi("ignored by the production reviewer", {
      prompt: { raw: "fixture", label: "fixture" },
      vars: { caseId: "react-16-to-19-profile-editor" },
    });

    expect(provider.id()).toBe("code-review-evals:openai/test-model");
    expect(deps.createModel).toHaveBeenCalledWith("process-secret", "openai/test-model");
    expect(deps.createReviewer).toHaveBeenCalledOnce();
    expect(deps.generate).toHaveBeenCalledWith({ request, repositoryRoot: deps.repositoryRoot });
    expect(JSON.parse(response.output as string)).toEqual(result);
    expect(response).toMatchObject({
      format: "json",
      metadata: {
        model: "openai/test-model",
        caseId: "react-16-to-19-profile-editor",
      },
    });
    expect(response.metadata?.promptFingerprint).toMatch(/^[0-9a-f]{64}$/u);
    expect(JSON.stringify(response)).not.toContain("process-secret");
  });

  it("rejects malformed provider configuration and unknown or escaping case ids", async () => {
    const deps = dependencies();
    const invalidProvider = new CodeReviewEvalProvider({ config: { model: "" } }, deps);
    const validProvider = new CodeReviewEvalProvider({ config: { model: "openai/test-model" } }, deps);

    await expect(invalidProvider.callApi("", callContext("react-16-to-19-profile-editor"))).resolves.toEqual({
      error: "Invalid code-review eval provider configuration.",
    });
    await expect(validProvider.callApi("", callContext("unknown"))).resolves.toEqual({
      error: "Invalid code-review eval case.",
    });
    await expect(validProvider.callApi("", callContext("../../outside"))).resolves.toEqual({
      error: "Invalid code-review eval case.",
    });
    expect(deps.readFile).not.toHaveBeenCalled();
    expect(deps.createModel).not.toHaveBeenCalled();
  });

  it("rejects fixture paths that resolve outside the committed case root", async () => {
    const fixtureRoot = path.resolve("C:/fixtures/cases");
    const outside = path.resolve("C:/fixtures/outside/request.json");
    const deps = dependencies({
      fixtureRoot,
      realpath: vi
        .fn()
        .mockResolvedValueOnce(fixtureRoot)
        .mockResolvedValueOnce(outside)
        .mockResolvedValueOnce(path.join(fixtureRoot, "react-16-to-19-profile-editor", "repository")),
    });
    const provider = new CodeReviewEvalProvider({ config: { model: "openai/test-model" } }, deps);

    await expect(provider.callApi("", callContext("react-16-to-19-profile-editor"))).resolves.toEqual({
      error: "Invalid code-review eval case.",
    });
    expect(deps.readFile).not.toHaveBeenCalled();
    expect(deps.createModel).not.toHaveBeenCalled();
  });

  it("requires a process credential before fixture or provider work", async () => {
    const deps = dependencies({ getEnvironment: vi.fn(() => ({})) });
    const provider = new CodeReviewEvalProvider({ config: { model: "openai/test-model" } }, deps);

    await expect(provider.callApi("", callContext("react-16-to-19-profile-editor"))).resolves.toEqual({
      error: "OPENROUTER_API_KEY is required.",
    });
    expect(deps.realpath).not.toHaveBeenCalled();
    expect(deps.createModel).not.toHaveBeenCalled();
  });

  it("redacts raw provider failures and secret-like exception text", async () => {
    const deps = dependencies();
    deps.generate.mockRejectedValueOnce(new Error("upstream failed with sk-live-secret"));
    const provider = new CodeReviewEvalProvider({ config: { model: "openai/test-model" } }, deps);

    const response = await provider.callApi("", {
      prompt: { raw: "", label: "fixture" },
      vars: { caseId: "react-16-to-19-profile-editor" },
    });

    expect(response).toEqual({ error: "Code-review evaluation failed." });
    expect(JSON.stringify(response)).not.toContain("sk-live-secret");
    expect(JSON.stringify(response)).not.toContain("process-secret");
  });
});
