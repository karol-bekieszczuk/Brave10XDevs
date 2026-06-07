import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { diagnoseSelectedLog } from "../src/lib/diagnosis/service";
import type { DiagnosisKnowledgeChunk, DiagnosisRetrievalClient } from "../src/lib/diagnosis/retrieval";
import type { DiagnosisProvider } from "../src/lib/diagnosis/provider";
import type { DiagnosisResponse, DiagnosisScopeStatus } from "../src/lib/diagnosis/schema";
import type { GrowLogClient } from "../src/lib/grow-logs/repository";
import type { GrowLogRow } from "../src/lib/grow-logs/types";

const CASES_PATH = path.resolve(
  "context",
  "changes",
  "diagnosis-quality-rubric",
  "reference",
  "diagnosis-evaluation-cases.json",
);

const expectedScopeClasses = ["in_scope", "missing_context", "mixed_scope", "out_of_scope"] as const;

const evaluationCaseSchema = z.object({
  id: z.string().min(1),
  stage: z.enum(["agar", "grain"]),
  grow_log: z.string().min(1),
  question: z.string().min(1),
  expected_outcome: z.string().min(1),
  expected_signals: z.array(z.string().min(1)),
  critical_missing_context: z.array(z.string().min(1)),
  scope_class: z.enum(expectedScopeClasses),
  counts_toward_prd_accuracy: z.boolean(),
  notes: z.string().min(1),
});

const evaluationCasesFileSchema = z.object({
  schema: z.record(z.string(), z.string()),
  cases: z.array(evaluationCaseSchema),
});

type EvaluationCase = z.infer<typeof evaluationCaseSchema>;

interface EvaluationCheck {
  name: string;
  passed: boolean;
  detail: string;
}

interface EvaluationResult {
  caseId: string;
  expectedScope: DiagnosisScopeStatus;
  actualScope: DiagnosisScopeStatus | "error";
  countsTowardPrdAccuracy: boolean;
  checks: EvaluationCheck[];
}

const client = {} as GrowLogClient & DiagnosisRetrievalClient;

function createGrowLog(testCase: EvaluationCase): GrowLogRow {
  return {
    id: testCase.id,
    ownerId: "evaluation-owner",
    stage: testCase.stage,
    title: `Evaluation case ${testCase.id}`,
    body: testCase.grow_log,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
  };
}

function createChunk(testCase: EvaluationCase): DiagnosisKnowledgeChunk {
  return {
    id: `${testCase.id}-chunk`,
    sourcePath: `lib/diagnosis/knowledge/${testCase.stage}-evaluation.md`,
    sourceHeading: `${testCase.stage} evaluation knowledge`,
    stage: testCase.stage,
    content: [
      `Stage: ${testCase.stage}`,
      `Selected-log evidence: ${testCase.grow_log}`,
      `Expected behavior: ${testCase.expected_outcome}`,
    ].join("\n"),
    similarity: 0.91,
  };
}

function deterministicDiagnosis(testCase: EvaluationCase): DiagnosisResponse {
  const selectedLogEvidence = testCase.grow_log.split(".")[0]?.trim() ?? testCase.grow_log;

  return {
    scopeStatus: "in_scope",
    possibleCauses: [
      `Possible causes should be judged from the selected ${testCase.stage} log evidence: ${selectedLogEvidence}.`,
    ],
    suggestedActions: [
      `Use conservative ${testCase.stage}-stage next steps and keep observing visible changes from this selected log.`,
    ],
    confidenceBand: "low",
    uncertainty:
      "This deterministic evaluation response is uncertainty-forward and avoids claiming a definitive cause.",
    followUpQuestion: null,
    sources: [
      {
        sourcePath: `lib/diagnosis/knowledge/${testCase.stage}-evaluation.md`,
        sourceHeading: `${testCase.stage} evaluation knowledge`,
      },
    ],
  };
}

function createProvider(testCase: EvaluationCase): DiagnosisProvider {
  return {
    createQueryEmbedding: () => Promise.resolve([0.1, 0.2, 0.3]),
    generateDiagnosis: () => Promise.resolve(deterministicDiagnosis(testCase)),
  };
}

function includesAny(value: string, needles: string[]) {
  const normalized = value.toLowerCase();
  return needles.some((needle) => normalized.includes(needle.toLowerCase()));
}

function responseText(response: DiagnosisResponse) {
  return [
    response.scopeStatus,
    ...response.possibleCauses,
    ...response.suggestedActions,
    response.uncertainty,
    response.followUpQuestion ?? "",
  ].join(" ");
}

async function runCase(testCase: EvaluationCase): Promise<EvaluationResult> {
  const response = await diagnoseSelectedLog(
    client,
    "evaluation-owner",
    {
      growLogId: testCase.id,
      question: testCase.question,
    },
    {
      getGrowLog: () => Promise.resolve(createGrowLog(testCase)),
      provider: createProvider(testCase),
      retrieveChunks: () => Promise.resolve(testCase.scope_class === "missing_context" ? [] : [createChunk(testCase)]),
    },
  );

  if (!response.ok) {
    return {
      caseId: testCase.id,
      expectedScope: testCase.scope_class,
      actualScope: "error",
      countsTowardPrdAccuracy: testCase.counts_toward_prd_accuracy,
      checks: [
        {
          name: "no critical failures",
          passed: false,
          detail: `Service returned ${response.error.code}: ${response.error.message}`,
        },
      ],
    };
  }

  const diagnosis = response.diagnosis;
  const text = responseText(diagnosis);
  const checks: EvaluationCheck[] = [
    {
      name: "scope class",
      passed: diagnosis.scopeStatus === testCase.scope_class,
      detail: `expected ${testCase.scope_class}, got ${diagnosis.scopeStatus}`,
    },
    {
      name: "selected-log dependency",
      passed:
        diagnosis.scopeStatus !== "in_scope" ||
        includesAny(text, [testCase.stage, testCase.grow_log.split(" ")[0] ?? ""]),
      detail: "in-scope deterministic responses must reference selected-log evidence or stage",
    },
    {
      name: "uncertainty",
      passed: diagnosis.uncertainty.length > 0 && !/\bguarantee[ds]?\b|\bcertain(?:ly)?\b/i.test(text),
      detail: "response includes uncertainty and avoids guarantee language",
    },
    {
      name: "missing-context behavior",
      passed:
        testCase.scope_class !== "missing_context" ||
        (diagnosis.scopeStatus === "missing_context" &&
          diagnosis.followUpQuestion !== null &&
          diagnosis.possibleCauses.length === 0),
      detail: "missing-context cases ask a focused follow-up before diagnosing",
    },
    {
      name: "mixed-scope refusal",
      passed:
        testCase.scope_class !== "mixed_scope" ||
        (diagnosis.scopeStatus === "mixed_scope" && includesAny(text, ["unsupported", "only", "agar", "grain"])),
      detail: "mixed-scope cases decline unsupported scope and redirect to agar/grain troubleshooting",
    },
    {
      name: "out-of-scope redirect",
      passed:
        testCase.scope_class !== "out_of_scope" ||
        (diagnosis.scopeStatus === "out_of_scope" && includesAny(text, ["agar", "grain", "text-based"])),
      detail: "out-of-scope cases redirect back to text-based agar/grain troubleshooting",
    },
    {
      name: "no critical failures",
      passed:
        !/\bphoto upload\b|\bimage upload\b|\bsaved chat history\b|\bshare the log\b|\bfruiting yield advice\b/i.test(
          text,
        ) && !/\bsmell the\b|\bby smell\b|\buse smell\b/i.test(text),
      detail: "response avoids prohibited scope expansion and smell-check guidance",
    },
  ];

  return {
    caseId: testCase.id,
    expectedScope: testCase.scope_class,
    actualScope: diagnosis.scopeStatus,
    countsTowardPrdAccuracy: testCase.counts_toward_prd_accuracy,
    checks,
  };
}

function summarize(results: EvaluationResult[]) {
  const failed = results.filter((result) => result.checks.some((check) => !check.passed));
  const prdCases = results.filter((result) => result.countsTowardPrdAccuracy);
  const prdPassed = prdCases.filter((result) => result.checks.every((check) => check.passed));
  const expectedScopes = new Set(results.map((result) => result.expectedScope));
  const actualScopes = new Set(results.map((result) => result.actualScope));

  return {
    failed,
    prdCases,
    prdPassed,
    expectedScopes,
    actualScopes,
  };
}

async function main() {
  const raw = await readFile(CASES_PATH, "utf8");
  const parsed = evaluationCasesFileSchema.parse(JSON.parse(raw));
  const results = await Promise.all(parsed.cases.map((testCase) => runCase(testCase)));
  const summary = summarize(results);

  process.stdout.write(`Read ${parsed.cases.length} prepared diagnosis evaluation case(s).\n`);
  process.stdout.write(
    "Mode: deterministic contract checks only; this runner does not call the live model provider.\n",
  );
  process.stdout.write(`Expected scope classes: ${[...summary.expectedScopes].sort().join(", ")}\n`);
  process.stdout.write(`Observed scope classes: ${[...summary.actualScopes].sort().join(", ")}\n`);
  process.stdout.write(
    `PRD accuracy cases: ${summary.prdPassed.length}/${summary.prdCases.length} deterministic contract pass; guardrail-only cases: ${
      results.length - summary.prdCases.length
    }.\n`,
  );

  for (const result of results) {
    const status = result.checks.every((check) => check.passed) ? "PASS" : "FAIL";
    const bucket = result.countsTowardPrdAccuracy ? "prd_accuracy" : "guardrail_only";
    process.stdout.write(`${status} ${result.caseId} [${bucket}] ${result.actualScope}\n`);

    for (const check of result.checks) {
      process.stdout.write(`  ${check.passed ? "ok" : "fail"} - ${check.name}: ${check.detail}\n`);
    }
  }

  const missingExpectedScopes = expectedScopeClasses.filter((scopeClass) => !summary.expectedScopes.has(scopeClass));
  const missingObservedScopes = expectedScopeClasses.filter((scopeClass) => !summary.actualScopes.has(scopeClass));

  if (parsed.cases.length !== 10) {
    process.stderr.write(`Expected 10 prepared cases, read ${parsed.cases.length}.\n`);
    process.exitCode = 1;
  }

  if (missingExpectedScopes.length > 0 || missingObservedScopes.length > 0) {
    process.stderr.write(
      `Missing scope classes. Expected set missing: ${missingExpectedScopes.join(", ") || "none"}; observed set missing: ${
        missingObservedScopes.join(", ") || "none"
      }.\n`,
    );
    process.exitCode = 1;
  }

  if (summary.failed.length > 0) {
    process.stderr.write(`${summary.failed.length} prepared case(s) failed deterministic contract checks.\n`);
    process.exitCode = 1;
  }
}

await main();
