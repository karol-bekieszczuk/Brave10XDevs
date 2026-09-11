import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

type YamlRecord = Record<string, unknown>;

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../..");
const workflowPath = resolve(repositoryRoot, ".github/workflows/review.yml");
const actionPath = resolve(repositoryRoot, ".github/actions/ai-pr-review/action.yml");

function record(value: unknown): YamlRecord {
  expect(value).toBeTypeOf("object");
  expect(value).not.toBeNull();
  expect(Array.isArray(value)).toBe(false);
  return value as YamlRecord;
}

function strings(value: unknown): string[] {
  expect(value).toBeInstanceOf(Array);
  return value as string[];
}

function normalizeWhitespace(value: unknown): string {
  return String(value).replace(/\s+/gu, " ").trim();
}

describe("repository-root AI review workflow contract", () => {
  it("defines the approved trigger, scope, permissions, and concurrency policy", async () => {
    const workflow = record(parse(await readFile(workflowPath, "utf8")));
    const pullRequest = record(record(workflow.on).pull_request);

    expect(strings(pullRequest.types)).toEqual(["opened", "reopened", "ready_for_review", "synchronize", "labeled"]);
    expect(strings(pullRequest.branches)).toEqual(["master"]);
    expect(strings(pullRequest.paths)).toEqual([
      "MycoHubAI/**",
      ".github/workflows/review.yml",
      ".github/actions/ai-pr-review/**",
    ]);
    expect(record(workflow.permissions)).toEqual({ contents: "read", "pull-requests": "write", issues: "write" });
    expect(record(workflow.concurrency)).toEqual({
      group: "${{ github.workflow }}-${{ github.event.pull_request.number }}",
      "cancel-in-progress": true,
    });
  });

  it("skips untrusted PRs and accepts only the approved retry label event", async () => {
    const workflow = record(parse(await readFile(workflowPath, "utf8")));
    const reviewJob = record(record(workflow.jobs).review);

    expect(normalizeWhitespace(reviewJob.if)).toBe(
      "github.event.pull_request.head.repo.full_name == github.repository && " +
        "github.event.pull_request.user.login != 'dependabot[bot]' && " +
        "(github.event.action != 'labeled' || github.event.label.name == 'ai-cr:review')",
    );
  });

  it("separates trusted base automation from the data-only head checkout", async () => {
    const workflow = record(parse(await readFile(workflowPath, "utf8")));
    const steps = strings(record(record(workflow.jobs).review).steps).map(record);
    const checkouts = steps.filter((step) => String(step.uses).startsWith("actions/checkout@"));

    expect(checkouts).toHaveLength(2);
    expect(checkouts[0]).toMatchObject({
      uses: "actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
      with: { ref: "${{ github.event.pull_request.base.sha }}", path: "automation", "persist-credentials": false },
    });
    expect(checkouts[1]).toMatchObject({
      uses: "actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
      with: {
        ref: "${{ github.event.pull_request.head.sha }}",
        path: "target",
        "fetch-depth": 0,
        "persist-credentials": false,
      },
    });

    const invocation = steps.find((step) => step.uses === "./automation/.github/actions/ai-pr-review");
    expect(invocation).toBeDefined();
    expect(record(invocation?.with)).toEqual({
      "openrouter-api-key": "${{ secrets.OPENROUTER_API_KEY }}",
      "github-token": "${{ secrets.GITHUB_TOKEN }}",
      "automation-path": "${{ github.workspace }}/automation",
      "target-repository-path": "${{ github.workspace }}/target/MycoHubAI",
      "event-path": "${{ github.event_path }}",
    });
  });

  it("wires every action input and its single declared output without secret context access", async () => {
    const source = await readFile(actionPath, "utf8");
    const action = record(parse(source));
    const inputs = record(action.inputs);
    const outputs = record(action.outputs);
    const steps = strings(record(action.runs).steps).map(record);

    expect(Object.keys(inputs)).toEqual([
      "openrouter-api-key",
      "github-token",
      "automation-path",
      "target-repository-path",
      "event-path",
    ]);
    expect(Object.values(inputs).every((input) => record(input).required === true)).toBe(true);
    expect(outputs).toEqual({
      result: { description: "Serialized PR review orchestration result", value: "${{ steps.review.outputs.result }}" },
    });
    expect(source).not.toContain("secrets.");
    expect(source).not.toContain("dist/review.js");
    const setupNodeStep = steps.find((step) => String(step.uses).startsWith("actions/setup-node@"));
    expect(setupNodeStep).toMatchObject({
      uses: "actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020",
      with: { "node-version": "24.15.0" },
    });
    const installStep = steps.find((step) => step.name === "Install the trusted reviewer package");
    expect(normalizeWhitespace(installStep?.run)).toBe(
      'npm ci --prefix "$AUTOMATION_PATH/MycoHubAI/packages/code-reviewer"',
    );
    const reviewStep = steps.find((step) => step.id === "review");
    expect(reviewStep).toBeDefined();
    const reviewRun = String(reviewStep?.run);
    expect(reviewRun).toContain(
      'npm --silent --prefix "$AUTOMATION_PATH/MycoHubAI/packages/code-reviewer" run review:pr',
    );
    expect(reviewRun).toContain("echo 'result<<MYCOHUB_AI_REVIEW_RESULT'");
    expect(reviewRun).toContain('echo "$result"');
    expect(reviewRun).toContain('} >> "$GITHUB_OUTPUT"');
    expect(record(reviewStep?.env)).toEqual({
      AUTOMATION_PATH: "${{ inputs.automation-path }}",
      REPOSITORY_ROOT: "${{ inputs.target-repository-path }}",
      GITHUB_EVENT_PATH: "${{ inputs.event-path }}",
      OPENROUTER_API_KEY: "${{ inputs.openrouter-api-key }}",
      GITHUB_TOKEN: "${{ inputs.github-token }}",
    });
    for (const step of steps.filter((candidate) => candidate.id !== "review")) {
      expect(record(step.env ?? {})).not.toHaveProperty("OPENROUTER_API_KEY");
      expect(record(step.env ?? {})).not.toHaveProperty("GITHUB_TOKEN");
    }
  });

  it("pins third-party actions and removes obsolete integration paths", async () => {
    const [workflow, action] = await Promise.all([readFile(workflowPath, "utf8"), readFile(actionPath, "utf8")]);
    const combined = `${workflow}\n${action}`;

    expect(combined).toContain("# actions/checkout v4.4.0");
    expect(combined).toContain("# actions/setup-node v4.4.0");
    expect(combined).not.toContain("twoj-zespol/ai-reviewer@");
    expect(combined).not.toContain("dist/review.js");
    expect(combined).not.toMatch(/uses:\s+actions\/(?:checkout|setup-node)@v\d/u);
  });
});
