# Pull Request AI Code Review — Plan Brief

> Full plan: `context/changes/ci-cd-code-review/plan.md`
> Research: `context/changes/ci-cd-code-review/research.md`

## What & Why

Build an advisory AI review for pull requests affecting MycoHubAI. Each current PR head receives three evidence-based quality scores, one update-in-place summary comment, and an exclusive result label, with explicit retry and operational-error handling.

The implementation also repairs the existing nonfunctional integration: GitHub cannot discover the nested workflow, its remote action reference is a placeholder, and the local composite action calls a missing file.

## Starting Point

The standalone reviewer already has an injectable AI SDK agent, strict findings schema, bounded read-only repository tools, and deterministic tests. It does not own PR metadata, scoring, GitHub comments, labels, event handling, or diff acquisition, and its generic `{ findings }` contract intentionally forbids scores and verdicts.

The actual Git root is `Brave10XDevs`, one level above MycoHubAI. Both current workflow/action stubs live under MycoHubAI's nested `.github` directory and are not a working GitHub integration.

## Desired End State

A repository-root workflow reviews current same-repository PR heads targeting `master` when MycoHubAI or its review automation changes. It uses trusted base code to analyze an isolated head checkout, never executes PR-controlled code with secrets, and skips fork and Dependabot PRs.

Passing and failing reviews are advisory and update one comment plus one result label. Operational failures use `ai-cr:error` and fail the workflow; `ai-cr:review` triggers a consumable on-demand retry.

## Key Decisions Made

| Decision               | Choice                                                                              | Why                                                                   | Source   |
| ---------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------- |
| Repository scope       | `MycoHubAI/**` plus its root review automation                                      | Avoid paying to review unrelated monorepo projects                    | Plan     |
| PR events and retry    | `opened`, `reopened`, `ready_for_review`, `synchronize`; consume matching `labeled` | Keep the result aligned with current HEAD and permit repeatable retry | Plan     |
| Fork/Dependabot policy | Explicitly skip                                                                     | Provider secrets are unavailable/untrusted in those contexts          | Plan     |
| PR description         | Include at most 8,000 characters with truncation marker                             | Preserve intent at bounded cost                                       | Plan     |
| Diff                   | Merge-base to HEAD with manifest; fail closed above 100 KiB                         | Review the complete bounded contribution without silent omissions     | Plan     |
| Passing threshold      | Average at least 7, every score at least 5, no `error` finding                      | Balance overall quality with hard floors                              | Plan     |
| Status semantics       | Review is advisory; operational failure uses `ai-cr:error` and fails                | Separate automation health from a probabilistic code verdict          | Plan     |
| Existing reviewer      | Preserve findings-only API; add PR-specific path                                    | Avoid breaking the validated generic reviewer                         | Research |
| Workflow trust         | Execute base-SHA automation; analyze head separately                                | Prevent head-controlled code from receiving secrets/write token       | Research |

## Scope

**In scope:**

- Repository-root workflow and local composite action.
- PR-specific contracts, scoring, bounded merge-base diff, CLI, and tests.
- One marked comment, result-label reconciliation, retry, and stale-run protection.
- Documentation and live provider/PR acceptance.

**Out of scope:**

- Other monorepo projects, fork/Dependabot AI review, and branch protection.
- Extra scoring criteria or changes to the generic findings-only contract.
- Browser E2E, default paid tests, package publishing, or deployment changes.

## Architecture / Approach

```text
repo-root pull_request workflow
├── trusted base SHA → action + reviewer + secrets
└── isolated head SHA → bounded diff → typed scores
                                      → policy → comment + label
```

Pure TypeScript modules own validation, prompt rendering, scoring, comments, and label state. Injected model, Git, and GitHub boundaries keep the default suite deterministic; a real PR is the final integration proof.

## Phases at a Glance

| Phase                        | What it delivers                                 | Key risk                                      |
| ---------------------------- | ------------------------------------------------ | --------------------------------------------- |
| 1. PR contract and policy    | Strict scoring model and deterministic verdict   | Accidentally breaking the generic reviewer    |
| 2. GitHub orchestration      | Idempotent comments, labels, retry, and failures | Partial API mutations and stale runs          |
| 3. Action and workflow       | Discoverable, trusted, executable automation     | Secret exposure through head-controlled code  |
| 4. Operations and live proof | Runbook plus real provider/PR acceptance         | Mistaking mocks for live integration evidence |

**Prerequisites:** Repository administration access for the secret and labels; a same-repository test branch/PR; OpenRouter access for the final manual gate.

**Estimated effort:** About 4 focused implementation sessions across 4 phases, with a human verification gate after each phase.

## Open Risks & Assumptions

- GitHub comment/label mutations are not transactional; idempotent retry repairs partial state, but API transport failure cannot guarantee an `ai-cr:error` label.
- The 100-KiB patch ceiling intentionally rejects large PRs instead of issuing incomplete scores and may need later tuning from observed cost.
- Same-repository head code remains untrusted and must never execute with credentials.
- Static YAML tests cannot prove runner permissions or GitHub behavior; live PR acceptance remains mandatory.

## Success Criteria (Summary)

- Every eligible current PR head produces one marked score comment and one correct result label without exposing credentials.
- Retry updates existing state, and stale/concurrent runs cannot overwrite a newer head's review.
- Fork/Dependabot contexts are skipped, operational failures are distinct, and negative AI results remain advisory.
