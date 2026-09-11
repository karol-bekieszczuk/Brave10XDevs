import { PULL_REQUEST_COMMENT_MARKER, renderPullRequestComment, type PullRequestCommentStatus } from "./comment.js";
import { labelForStatus, reconcileLabels } from "./labels.js";
import { evaluatePullRequestReview } from "./policy.js";
import type { PullRequestGitHubClient } from "./github-client.js";
import type { PullRequestReviewer } from "./reviewer.js";
import type { PullRequestReviewRequest } from "./schema.js";
import { toOperationalFailure } from "./operational-error.js";
import type { PullRequestIdentity } from "./input.js";

export interface PullRequestOrchestratorDependencies {
  acquireRequest(): Promise<PullRequestReviewRequest>;
  reviewer: PullRequestReviewer;
  github: PullRequestGitHubClient;
  repositoryRoot: string;
  runUrl?: string;
  requestIdentity?: PullRequestIdentity;
}
export interface PullRequestOrchestrationResult {
  status: PullRequestCommentStatus;
  exitCode: number;
  stale?: boolean;
}

async function publish(
  github: PullRequestGitHubClient,
  status: PullRequestCommentStatus,
  request: Pick<PullRequestReviewRequest, "headSha" | "retry"> &
    Partial<Pick<PullRequestReviewRequest, "changedFiles">>,
  result?: Awaited<ReturnType<PullRequestReviewer["generate"]>>,
  operationalFailure?: ReturnType<typeof toOperationalFailure>,
  runUrl?: string,
) {
  const comment = renderPullRequestComment({
    status,
    result,
    operationalFailure,
    changedFileCount: request.changedFiles?.length,
    headSha: request.headSha,
    runUrl,
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

async function consumeRetry(github: PullRequestGitHubClient): Promise<void> {
  const labels = await github.getLabels();
  if (labels.includes("ai-cr:review")) await github.removeLabel("ai-cr:review");
}

async function checkCurrentHead(
  github: PullRequestGitHubClient,
  reviewedHeadSha: string,
): Promise<"current" | "stale" | "unavailable"> {
  try {
    return (await github.getCurrentHeadSha()) === reviewedHeadSha ? "current" : "stale";
  } catch {
    return "unavailable";
  }
}

export async function runPullRequestOrchestrator(
  dependencies: PullRequestOrchestratorDependencies,
): Promise<PullRequestOrchestrationResult> {
  let request: PullRequestReviewRequest | undefined;
  try {
    if (dependencies.requestIdentity?.retry) await consumeRetry(dependencies.github);
    request = await dependencies.acquireRequest();
    if (request.retry && !dependencies.requestIdentity?.retry) await consumeRetry(dependencies.github);
    const result = await dependencies.reviewer.generate({ request, repositoryRoot: dependencies.repositoryRoot });
    const headState = await checkCurrentHead(dependencies.github, request.headSha);
    if (headState === "unavailable") return { status: "error", exitCode: 1 };
    if (headState === "stale") return { status: "error", exitCode: 0, stale: true };
    const status = evaluatePullRequestReview(result).verdict;
    await publish(dependencies.github, status, request, result, undefined, dependencies.runUrl);
    return { status, exitCode: 0 };
  } catch (error) {
    const publicationRequest = request ?? dependencies.requestIdentity;
    if (!publicationRequest) return { status: "error", exitCode: 1 };
    const headState = await checkCurrentHead(dependencies.github, publicationRequest.headSha);
    if (headState === "unavailable") return { status: "error", exitCode: 1 };
    if (headState === "stale") return { status: "error", exitCode: 1, stale: true };
    try {
      await publish(
        dependencies.github,
        "error",
        publicationRequest,
        undefined,
        toOperationalFailure(error),
        dependencies.runUrl,
      );
    } catch {
      /* Preserve the operational failure exit status. */
    }
    return { status: "error", exitCode: 1 };
  }
}
