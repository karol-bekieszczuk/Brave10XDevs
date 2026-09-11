import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PullRequestOrchestrationResult, PullRequestOrchestratorDependencies } from "./orchestrator.js";

const mocks = vi.hoisted(() => ({
  createPullRequestIdentity: vi.fn(),
  createPullRequestReviewRequest: vi.fn(),
  GitHubClient: vi.fn(
    class {
      readonly kind = "github-client";
    },
  ),
  runPullRequestOrchestrator:
    vi.fn<(input: PullRequestOrchestratorDependencies) => Promise<PullRequestOrchestrationResult>>(),
  generatePullRequestReview: vi.fn(),
}));

vi.mock("./input.js", () => ({
  createPullRequestIdentity: mocks.createPullRequestIdentity,
  createPullRequestReviewRequest: mocks.createPullRequestReviewRequest,
}));
vi.mock("./github-client.js", () => ({ GitHubClient: mocks.GitHubClient }));
vi.mock("./orchestrator.js", () => ({ runPullRequestOrchestrator: mocks.runPullRequestOrchestrator }));
vi.mock("./generate.js", () => ({ generatePullRequestReview: mocks.generatePullRequestReview }));

import { runPullRequestCli } from "./cli.js";
import { OperationalError } from "./operational-error.js";

const request = {
  repository: "Brave10XDevs/MycoHubAI",
  pullRequestNumber: 42,
  baseSha: "a".repeat(40),
  headSha: "b".repeat(40),
  title: "Review me",
  body: "",
  changedFiles: [{ path: "src/example.ts", changeType: "modified", binary: false, submodule: false }],
  patch: "+change",
  retry: false,
};

describe("PR CLI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createPullRequestIdentity.mockResolvedValue({
      repository: request.repository,
      pullRequestNumber: request.pullRequestNumber,
      headSha: request.headSha,
      retry: request.retry,
    });
    mocks.createPullRequestReviewRequest.mockResolvedValue(request);
    mocks.runPullRequestOrchestrator.mockResolvedValue({ status: "passed", exitCode: 0 });
  });

  it("fails before filesystem or network work when required execution inputs are absent", async () => {
    await expect(runPullRequestCli({ environment: {}, writeOutput: () => undefined })).resolves.toBe(1);
    expect(mocks.createPullRequestReviewRequest).not.toHaveBeenCalled();
    expect(mocks.createPullRequestIdentity).not.toHaveBeenCalled();
    expect(mocks.GitHubClient).not.toHaveBeenCalled();
  });

  it("delegates a valid run and emits the deterministic orchestration result", async () => {
    const writeOutput = vi.fn();
    const environment = {
      GITHUB_SERVER_URL: "https://github.com",
      GITHUB_RUN_ID: "123",
      OPENROUTER_API_KEY: "provider-secret",
    };

    await expect(
      runPullRequestCli({
        eventPath: "event.json",
        repositoryRoot: "repo",
        token: "github-secret",
        environment,
        writeOutput,
      }),
    ).resolves.toBe(0);

    expect(mocks.createPullRequestIdentity).toHaveBeenCalledWith("event.json");
    expect(mocks.createPullRequestReviewRequest).not.toHaveBeenCalled();
    expect(mocks.GitHubClient).toHaveBeenCalledWith({
      token: "github-secret",
      repository: request.repository,
      pullRequestNumber: request.pullRequestNumber,
    });
    expect(mocks.runPullRequestOrchestrator).toHaveBeenCalledOnce();
    expect(mocks.createPullRequestReviewRequest).not.toHaveBeenCalled();
    expect(writeOutput).toHaveBeenCalledWith(JSON.stringify({ status: "passed", exitCode: 0 }));
  });

  it("returns a categorized numeric failure when PR identity cannot be parsed", async () => {
    const writeOutput = vi.fn();
    mocks.createPullRequestIdentity.mockRejectedValue(
      new OperationalError({ code: "INPUT_EVENT_INVALID", stage: "input-validation" }),
    );

    await expect(
      runPullRequestCli({ eventPath: "event.json", repositoryRoot: "repo", token: "github-secret", writeOutput }),
    ).resolves.toBe(1);

    expect(mocks.GitHubClient).not.toHaveBeenCalled();
    expect(mocks.runPullRequestOrchestrator).not.toHaveBeenCalled();
    expect(writeOutput).toHaveBeenCalledWith(
      JSON.stringify({ status: "error", exitCode: 1, errorCode: "INPUT_EVENT_INVALID" }),
    );
  });
});
