import { fileURLToPath } from "node:url";
import { createPullRequestReviewRequest } from "./input.js";
import { GitHubClient } from "./github-client.js";
import { runPullRequestOrchestrator } from "./orchestrator.js";
import { generatePullRequestReview } from "./generate.js";

export async function runPullRequestCli(
  input: {
    eventPath?: string;
    repositoryRoot?: string;
    token?: string;
    environment?: Record<string, string | undefined>;
    writeOutput?: (message: string) => void;
  } = {},
): Promise<number> {
  const eventPath = input.eventPath ?? process.env.GITHUB_EVENT_PATH;
  const repositoryRoot = input.repositoryRoot ?? process.cwd();
  const token = input.token ?? process.env.GITHUB_TOKEN;
  if (!eventPath || !token) {
    input.writeOutput?.("Missing GITHUB_EVENT_PATH or GITHUB_TOKEN.");
    return 1;
  }
  const request = await createPullRequestReviewRequest(eventPath, repositoryRoot);
  const environment = input.environment ?? process.env;
  const serverUrl = environment.GITHUB_SERVER_URL;
  const runId = environment.GITHUB_RUN_ID;
  const runUrl =
    serverUrl && serverUrl.startsWith("https://") && runId && /^\d+$/u.test(runId)
      ? `${serverUrl.replace(/\/$/u, "")}/${request.repository}/actions/runs/${runId}`
      : undefined;
  const github = new GitHubClient({
    token,
    repository: request.repository,
    pullRequestNumber: request.pullRequestNumber,
  });
  const result = await runPullRequestOrchestrator({
    acquireRequest: () => Promise.resolve(request),
    reviewer: {
      generate: (value) => generatePullRequestReview(value.request, environment, value.repositoryRoot),
    },
    github,
    repositoryRoot,
    runUrl,
  });
  input.writeOutput?.(JSON.stringify(result));
  return result.exitCode;
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  void runPullRequestCli().then((code) => {
    process.exitCode = code;
  });
