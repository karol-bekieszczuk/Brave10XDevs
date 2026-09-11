import { PULL_REQUEST_COMMENT_MARKER, renderPullRequestComment, type PullRequestCommentStatus } from "./comment.js";
import { labelForStatus, reconcileLabels } from "./labels.js";
import { evaluatePullRequestReview } from "./policy.js";
import type { PullRequestGitHubClient } from "./github-client.js";
import type { PullRequestReviewer } from "./reviewer.js";
import type { PullRequestReviewRequest } from "./schema.js";

export interface PullRequestOrchestratorDependencies {
  acquireRequest(): Promise<PullRequestReviewRequest>;
  reviewer: PullRequestReviewer;
  github: PullRequestGitHubClient;
  repositoryRoot: string;
}
export interface PullRequestOrchestrationResult {
  status: PullRequestCommentStatus;
  exitCode: number;
  stale?: boolean;
}

async function publish(
  github: PullRequestGitHubClient,
  status: PullRequestCommentStatus,
  request: PullRequestReviewRequest,
  result?: Awaited<ReturnType<PullRequestReviewer["generate"]>>,
  errorCategory?: string,
) {
  const comment = renderPullRequestComment({
    status,
    result,
    errorCategory,
    changedFileCount: request.changedFiles.length,
  });
  const existing = await github.findMarkedComment(PULL_REQUEST_COMMENT_MARKER);
  if (existing) await github.updateComment(existing.id, comment);
  else await github.createComment(comment);
  const target = labelForStatus(status);
  await github.ensureLabel(target);
  const changes = reconcileLabels(await github.getLabels(), target, request.retry);
  await Promise.all(changes.remove.map((name) => github.removeLabel(name)));
  await Promise.all(changes.add.map((name) => github.addLabel(name)));
}

export async function runPullRequestOrchestrator(
  dependencies: PullRequestOrchestratorDependencies,
): Promise<PullRequestOrchestrationResult> {
  let request: PullRequestReviewRequest | undefined;
  try {
    request = await dependencies.acquireRequest();
    if (request.retry) {
      const labels = await dependencies.github.getLabels();
      if (labels.includes("ai-cr:review")) await dependencies.github.removeLabel("ai-cr:review");
    }
    const result = await dependencies.reviewer.generate({ request, repositoryRoot: dependencies.repositoryRoot });
    if ((await dependencies.github.getCurrentHeadSha()) !== request.headSha)
      return { status: "error", exitCode: 0, stale: true };
    const status = evaluatePullRequestReview(result).verdict;
    await publish(dependencies.github, status, request, result);
    return { status, exitCode: 0 };
  } catch (error) {
    if (!request) return { status: "error", exitCode: 1 };
    try {
      await publish(
        dependencies.github,
        "error",
        request,
        undefined,
        error instanceof Error ? error.message : "unknown failure",
      );
    } catch {
      /* Preserve the operational failure exit status. */
    }
    return { status: "error", exitCode: 1 };
  }
}
