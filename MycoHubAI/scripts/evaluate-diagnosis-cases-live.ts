import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { diagnoseSelectedLog } from "../src/lib/diagnosis/service";
import { createDiagnosisProvider } from "../src/lib/diagnosis/provider";
import type { DiagnosisApiResponse, DiagnosisResponse, DiagnosisScopeStatus } from "../src/lib/diagnosis/schema";

const CASES_PATH = path.resolve(
  "context",
  "changes",
  "diagnosis-quality-rubric",
  "reference",
  "diagnosis-evaluation-cases.json",
);

const REQUIRED_STAGE_SET = new Set(["agar", "grain"]);
const CASE_SCOPE_CLASSES = ["in_scope", "missing_context", "mixed_scope", "out_of_scope"] as const;
const APP_URL = "https://myco-hub-ai.karol-bekieszczuk.workers.dev";
const LOCAL_DEV_VARS_PATH = path.resolve(".dev.vars");

const evaluationCaseSchema = z.object({
  id: z.string().min(1),
  stage: z.enum(["agar", "grain"]),
  grow_log: z.string().min(1),
  question: z.string().min(1),
  expected_outcome: z.string().min(1),
  expected_signals: z.array(z.string().min(1)),
  critical_missing_context: z.array(z.string().min(1)),
  scope_class: z.enum(CASE_SCOPE_CLASSES),
  counts_toward_prd_accuracy: z.boolean(),
  notes: z.string().min(1),
});

const evaluationCasesFileSchema = z.object({
  schema: z.record(z.string(), z.string()),
  cases: z.array(evaluationCaseSchema),
});

type EvaluationCase = z.infer<typeof evaluationCaseSchema>;

type LiveFailureCategory =
  | "model_contract_failure"
  | "provider_runtime_failure"
  | "supabase_rpc_setup_failure"
  | "fixture_setup_failure"
  | "case_threshold_ambiguity";

interface LiveCaseCheck {
  name: string;
  passed: boolean;
  detail: string;
  category?: LiveFailureCategory;
  blocking?: boolean;
}

interface LiveCaseResult {
  caseId: string;
  expectedScope: DiagnosisScopeStatus;
  actualScope: DiagnosisScopeStatus | "error";
  checks: LiveCaseCheck[];
}

interface LiveFixture {
  id: string;
  stage: "agar" | "grain";
  title: string;
  body: string;
}

function parseDevVars(content: string) {
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex <= 0) {
      throw new Error(`Invalid .dev.vars line: ${rawLine}`);
    }

    const name = line.slice(0, separatorIndex).trim();

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      throw new Error(`Invalid .dev.vars variable name: ${name}`);
    }

    let value = line.slice(separatorIndex + 1).trim();
    const quote = value[0];

    if ((quote === `"` || quote === "'") && value.endsWith(quote)) {
      value = value.slice(1, -1);
    }

    process.env[name] ??= value;
  }
}

async function loadLocalDevVars() {
  try {
    parseDevVars(await readFile(LOCAL_DEV_VARS_PATH, "utf8"));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return;
    }

    throw error;
  }
}

function requireEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required for diagnosis:evaluate:live.`);
  }

  return value;
}

function requireSupabaseServiceRoleKey() {
  const value = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (value.split(".").length !== 3) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY must be the Supabase service_role JWT with three dot-separated parts.");
  }

  return value;
}

function createServiceRoleClient() {
  return createClient(requireEnv("SUPABASE_URL"), requireSupabaseServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        "X-Client-Info": "mycohubai-live-diagnosis-evaluator",
      },
    },
  });
}

function createFixture(testCase: EvaluationCase): LiveFixture {
  return {
    id: randomUUID(),
    stage: testCase.stage,
    title: `Live evaluation ${testCase.id}`,
    body: testCase.grow_log,
  };
}

function normalize(value: string) {
  return value.toLowerCase();
}

function includesAny(value: string, needles: string[]) {
  const normalized = normalize(value);
  return needles.some((needle) => normalized.includes(normalize(needle)));
}

function includesAllGroups(value: string, groups: string[][]) {
  return groups.every((group) => includesAny(value, group));
}

function responseText(response: DiagnosisResponse) {
  return [
    response.scopeStatus,
    ...response.possibleCauses,
    ...response.suggestedActions,
    response.uncertainty,
    response.followUpQuestion ?? "",
    ...response.sources.flatMap((source) => [source.sourcePath, source.sourceHeading ?? ""]),
  ].join(" ");
}

function signalGroups(testCase: EvaluationCase) {
  switch (testCase.id) {
    case "agar-001-green-spots-after-transfer":
      return [
        ["green", "green spots", "colored growth"],
        ["contamination", "contaminated", "contam"],
        ["possible", "plausible", "may", "might", "could"],
        ["avoid transferring", "do not transfer", "isolate", "discard"],
      ];
    case "agar-002-slow-clean-growth":
      return [
        ["slow", "slower than expected", "small white colony"],
        ["clean", "no colored patches", "no visible contamination"],
        ["monitor", "observe", "watch"],
        ["conditions", "incubation", "temperature", "recovery"],
      ];
    case "agar-003-question-alone-insufficient":
      return [
        ["missing", "not enough", "insufficient"],
        ["appearance", "visual", "looks like"],
        ["timing", "when", "how long"],
        ["growth pattern", "spread", "changes"],
      ];
    case "agar-004-mixed-agar-and-fruiting":
      return [
        ["agar", "plate", "fuzzy patch"],
        ["fruiting", "yield"],
        ["unsupported", "out of scope", "cannot help with that here"],
        ["agar or grain", "selected log", "text-based"],
      ];
    case "agar-005-fully-out-of-scope-photo-id":
      return [
        ["photo", "image", "picture"],
        ["species", "identify"],
        ["text-based", "agar or grain"],
        ["describe", "text observations", "selected log"],
      ];
    case "grain-001-wet-uncolonized-grains":
      return [
        ["wet", "pooling", "pressed together"],
        ["colonizing", "stall", "stalled"],
        ["possible", "plausible", "may", "might", "could"],
        ["monitor", "avoid expansion", "do not expand"],
      ];
    case "grain-002-recovery-after-shake":
      return [
        ["shake", "shaking"],
        ["recovery", "recovering", "bounce back"],
        ["monitor", "observe", "watch"],
        ["uncertain", "cannot know yet", "not guaranteed", "tentative"],
      ];
    case "grain-003-dry-stalled-growth":
      return [
        ["dry", "separated kernels", "stalled"],
        ["multiple", "several", "more than one"],
        ["conditions", "moisture", "weak inoculation"],
        ["conservative", "observe", "monitor"],
      ];
    case "grain-004-missing-visual-details":
      return [
        ["missing", "not enough", "insufficient"],
        ["timing", "when", "how long"],
        ["visual", "appearance", "contamination signs"],
        ["shake history", "moisture", "pooling", "growth pattern"],
      ];
    case "grain-005-mixed-grain-and-sharing":
      return [
        ["grain", "jar", "wetter bottom kernels"],
        ["share", "sharing", "another grower"],
        ["private", "single-user", "cannot share"],
        ["agar or grain", "selected log", "troubleshooting"],
      ];
    default:
      return [];
  }
}

function buildChecks(testCase: EvaluationCase, response: DiagnosisResponse): LiveCaseCheck[] {
  const text = responseText(response);
  const inScopeMissingContext =
    testCase.scope_class === "in_scope" &&
    response.scopeStatus === "missing_context" &&
    response.sources.length === 0 &&
    response.possibleCauses.length === 0;
  const checks: LiveCaseCheck[] = [
    {
      name: "scope class",
      passed: response.scopeStatus === testCase.scope_class,
      detail: `expected ${testCase.scope_class}, got ${response.scopeStatus}`,
      category: inScopeMissingContext ? "supabase_rpc_setup_failure" : "model_contract_failure",
    },
  ];

  if (testCase.scope_class === "in_scope") {
    checks.push({
      name: "case signals",
      passed: includesAllGroups(text, signalGroups(testCase)),
      detail: "response should reflect the prepared case signals without copying exact prose",
      category: "case_threshold_ambiguity",
      blocking: false,
    });
    checks.push({
      name: "uncertainty discipline",
      passed:
        response.confidenceBand !== null &&
        response.uncertainty.length > 0 &&
        !/\bguarantee(?:d|s)?\b|\bcertain(?:ly)?\b|\bdefinitely\b/i.test(text),
      detail: "in-scope responses need bounded uncertainty and must avoid guarantee language",
      category: "model_contract_failure",
    });
    checks.push({
      name: "selected-log evidence",
      passed: includesAny(text, [testCase.stage, "selected log", "plate", "jar", "growth", "wedge", "kernels"]),
      detail: "response should stay grounded in the selected log rather than generic cultivation advice",
      category: "case_threshold_ambiguity",
      blocking: false,
    });
  }

  if (testCase.scope_class === "missing_context") {
    checks.push({
      name: "missing-context follow-up",
      passed:
        response.followUpQuestion !== null &&
        response.possibleCauses.length === 0 &&
        includesAny(response.followUpQuestion, testCase.critical_missing_context),
      detail: "missing-context cases should ask a focused follow-up tied to the absent details",
      category: "model_contract_failure",
    });
  }

  if (testCase.scope_class === "mixed_scope") {
    checks.push({
      name: "mixed-scope redirect",
      passed: includesAny(text, ["unsupported", "agar or grain", "selected log", "private", "cannot share"]),
      detail: "mixed-scope cases should answer only the supported part and decline the unsupported part",
      category: "model_contract_failure",
    });
  }

  if (testCase.scope_class === "out_of_scope") {
    checks.push({
      name: "out-of-scope redirect",
      passed: includesAny(text, ["text-based", "agar or grain", "describe", "selected log"]),
      detail: "out-of-scope cases should redirect back to supported text-based troubleshooting",
      category: "model_contract_failure",
    });
  }

  checks.push({
    name: "no prohibited advice",
    passed: !/\bsmell the\b|\bby smell\b|\buse smell\b|\bphoto upload\b|\bimage upload\b|\bsaved chat history\b/i.test(
      text,
    ),
    detail: "responses must avoid smell checks and unsupported feature expansion",
    category: "model_contract_failure",
  });

  return checks;
}

function classifyErrorCode(code: DiagnosisApiResponse["error"]["code"]): LiveFailureCategory {
  switch (code) {
    case "invalid_model_output":
      return "model_contract_failure";
    case "provider_failed":
    case "provider_timeout":
      return "provider_runtime_failure";
    case "retrieval_failed":
      return "supabase_rpc_setup_failure";
    case "grow_log_not_found":
      return "fixture_setup_failure";
    default:
      return "case_threshold_ambiguity";
  }
}

async function verifyKnowledgeChunks(client: SupabaseClient) {
  const { data, error } = await client.from("diagnosis_knowledge_chunks").select("stage").limit(20);

  if (error) {
    throw new Error(`Supabase/RPC setup failure while reading diagnosis_knowledge_chunks: ${error.message}`);
  }

  const stages = new Set(data.map((row) => String(row.stage)));

  for (const stage of REQUIRED_STAGE_SET) {
    if (!stages.has(stage)) {
      throw new Error(`Supabase/RPC setup failure: diagnosis knowledge is missing ${stage} chunks.`);
    }
  }
}

async function ensureOwnerExists(client: SupabaseClient, ownerId: string) {
  const { data, error } = await client.auth.admin.getUserById(ownerId);

  if (error) {
    throw new Error(`Fixture setup failure while looking up LIVE_EVALUATION_OWNER_ID: ${error.message}`);
  }

  if (data.user.id.length === 0) {
    throw new Error("Fixture setup failure: LIVE_EVALUATION_OWNER_ID does not map to an existing auth user.");
  }
}

async function insertFixtures(client: SupabaseClient, ownerId: string, cases: EvaluationCase[]) {
  const fixtures = cases.map((testCase) => createFixture(testCase));
  const rows = fixtures.map((fixture) => ({
    id: fixture.id,
    owner_id: ownerId,
    stage: fixture.stage,
    title: fixture.title,
    body: fixture.body,
  }));

  const { error } = await client.from("grow_logs").insert(rows);

  if (error) {
    throw new Error(`Fixture setup failure while inserting live evaluation grow logs: ${error.message}`);
  }

  return new Map(cases.map((testCase, index) => [testCase.id, fixtures[index].id]));
}

async function cleanupFixtures(client: SupabaseClient, fixtureIds: string[]) {
  if (fixtureIds.length === 0) {
    return;
  }

  const { error } = await client.from("grow_logs").delete().in("id", fixtureIds);

  if (error) {
    throw new Error(`Fixture setup failure while deleting live evaluation grow logs: ${error.message}`);
  }
}

async function runCase(
  client: SupabaseClient,
  ownerId: string,
  providerApiKey: string,
  testCase: EvaluationCase,
  growLogId: string,
): Promise<LiveCaseResult> {
  try {
    const response = await diagnoseSelectedLog(
      client,
      ownerId,
      {
        growLogId,
        question: testCase.question,
      },
      {
        createProvider: () => createDiagnosisProvider(providerApiKey),
      },
    );

    if (!response.ok) {
      const responseCategory = classifyErrorCode(response.error.code);
      return {
        caseId: testCase.id,
        expectedScope: testCase.scope_class,
        actualScope: "error",
        checks: [
          {
            name: "service response",
            passed: false,
            detail: `${response.error.code}: ${response.error.message}`,
            category: responseCategory,
          },
        ],
      };
    }

    return {
      caseId: testCase.id,
      expectedScope: testCase.scope_class,
      actualScope: response.diagnosis.scopeStatus,
      checks: buildChecks(testCase, response.diagnosis),
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      caseId: testCase.id,
      expectedScope: testCase.scope_class,
      actualScope: "error",
      checks: [
        {
          name: "unexpected runtime failure",
          passed: false,
          detail,
          category: "provider_runtime_failure",
        },
      ],
    };
  }
}

function summarize(results: LiveCaseResult[]) {
  const failed = results.filter((result) => result.checks.some((check) => !check.passed && check.blocking !== false));
  const warnings = results.filter((result) => result.checks.some((check) => !check.passed && check.blocking === false));
  const categories = new Map<LiveFailureCategory, number>();

  for (const result of failed) {
    for (const check of result.checks.filter((entry) => !entry.passed && entry.blocking !== false && entry.category)) {
      categories.set(check.category, (categories.get(check.category) ?? 0) + 1);
    }
  }

  return { failed, warnings, categories };
}

async function main() {
  await loadLocalDevVars();

  const providerApiKey = requireEnv("OPENROUTER_API_KEY");
  const ownerId = requireEnv("LIVE_EVALUATION_OWNER_ID");
  const raw = await readFile(CASES_PATH, "utf8");
  const parsed = evaluationCasesFileSchema.parse(JSON.parse(raw));
  const client = createServiceRoleClient();

  await ensureOwnerExists(client, ownerId);
  await verifyKnowledgeChunks(client);

  const fixtureIdsByCase = await insertFixtures(client, ownerId, parsed.cases);

  try {
    const results: LiveCaseResult[] = [];

    for (const testCase of parsed.cases) {
      const growLogId = fixtureIdsByCase.get(testCase.id);

      if (!growLogId) {
        throw new Error(`Fixture setup failure: missing inserted grow log id for case ${testCase.id}.`);
      }

      results.push(await runCase(client, ownerId, providerApiKey, testCase, growLogId));
    }

    const summary = summarize(results);

    process.stdout.write(`Read ${parsed.cases.length} prepared diagnosis evaluation case(s).\n`);
    process.stdout.write("Mode: live provider + live Supabase retrieval/RPC.\n");
    process.stdout.write(`Owner: ${ownerId}\n`);
    process.stdout.write(`App URL: ${APP_URL}\n`);

    for (const result of results) {
      const passed = result.checks.every((check) => check.passed || check.blocking === false);
      process.stdout.write(
        `${passed ? "PASS" : "FAIL"} ${result.caseId} expected=${result.expectedScope} actual=${result.actualScope}\n`,
      );

      for (const check of result.checks) {
        const category = check.passed || !check.category ? "" : ` [${check.category}]`;
        const status = check.passed ? "ok" : check.blocking === false ? "warn" : "fail";
        process.stdout.write(`  ${status} - ${check.name}${category}: ${check.detail}\n`);
      }
    }

    if (summary.warnings.length > 0) {
      process.stdout.write(
        `${summary.warnings.length} live evaluation case(s) have non-blocking ambiguity warnings.\n`,
      );
    }

    if (summary.failed.length > 0) {
      process.stderr.write(`${summary.failed.length} live evaluation case(s) failed.\n`);

      for (const [category, count] of summary.categories.entries()) {
        process.stderr.write(`  ${category}: ${count}\n`);
      }

      process.exitCode = 1;
    }
  } finally {
    await cleanupFixtures(client, [...fixtureIdsByCase.values()]);
  }
}

await main();
