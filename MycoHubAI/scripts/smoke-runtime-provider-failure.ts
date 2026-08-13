import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createDiagnosisProvider } from "@/lib/diagnosis/provider";
import { diagnosisApiResponseSchema } from "@/lib/diagnosis/schema";
import { diagnoseSelectedLog } from "@/lib/diagnosis/service";

const GENERATED_EMAIL_PREFIX = "mycohub-runtime-provider-failure-";
const FORCE_FAILURE_ARGUMENT = "--force-failure-after-oracle";
const QUESTION_SENTINEL = "QUESTION_SENTINEL_RUNTIME_PROVIDER_FAILURE";
const GROW_LOG_BODY_SENTINEL = "GROW_LOG_BODY_SENTINEL_RUNTIME_PROVIDER_FAILURE";

interface GrowLogRecord {
  id: string;
  owner_id: string;
  stage: "agar" | "grain";
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
}

interface AdmissionState {
  owner_id: string;
  window_started_at: string;
  attempt_count: number;
  active_claim_id: string | null;
  active_expires_at: string | null;
}

interface CooldownState {
  owner_id: string;
  fingerprint: string;
  claimed_at: string;
}

function requireEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function isLoopbackAddress(address: string) {
  return address === "::1" || address.startsWith("127.") || address.startsWith("::ffff:127.");
}

async function assertLoopbackUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const ipVersion = isIP(hostname);
  const addresses = ipVersion === 0 ? await lookup(hostname, { all: true, verbatim: true }) : [{ address: hostname }];

  if (addresses.length === 0 || addresses.some(({ address }) => !isLoopbackAddress(address))) {
    throw new Error("SUPABASE_URL must resolve only to a loopback address; refusing to run against a remote project.");
  }
}

function createNodeClient(url: string, key: string) {
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

function expectNoError(error: { message: string } | null, label: string) {
  assert.equal(error, null, `${label}: ${error?.message ?? "unexpected Supabase error"}`);
}

function assertNoContentInAdmissionState(
  admission: AdmissionState,
  cooldowns: CooldownState[],
  forbiddenContent: string[],
) {
  const persistedAdmissionState = JSON.stringify({ admission, cooldowns });

  for (const content of forbiddenContent) {
    assert.equal(
      persistedAdmissionState.includes(content),
      false,
      `admission state persisted forbidden raw content: ${content}`,
    );
  }
}

function parseArguments() {
  const argumentsSet = new Set(process.argv.slice(2));
  const unknownArguments = [...argumentsSet].filter((argument) => argument !== FORCE_FAILURE_ARGUMENT);

  assert.deepEqual(unknownArguments, [], `unsupported argument(s): ${unknownArguments.join(", ")}`);

  return {
    forceFailureAfterOracle: argumentsSet.has(FORCE_FAILURE_ARGUMENT),
  };
}

async function createFixtureUser(admin: SupabaseClient, url: string, anonKey: string, runId: string) {
  const email = `${GENERATED_EMAIL_PREFIX}${runId}@example.test`;
  const password = `Runtime-${randomUUID()}-Aa1!`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });

  expectNoError(created.error, "create runtime provider-failure principal");
  assert(created.data.user, "create runtime provider-failure principal: missing user");
  assert(
    created.data.user.email?.startsWith(GENERATED_EMAIL_PREFIX),
    "refusing to track a non-fixture user for cleanup",
  );

  const client = createNodeClient(url, anonKey);
  const signedIn = await client.auth.signInWithPassword({ email, password });

  expectNoError(signedIn.error, "sign in runtime provider-failure principal");
  assert(signedIn.data.session, "sign in runtime provider-failure principal: missing session");
  assert.equal(signedIn.data.user.id, created.data.user.id, "runtime provider-failure JWT user mismatch");

  return {
    id: created.data.user.id,
    email,
    client,
  };
}

async function insertGrowLog(client: SupabaseClient, ownerId: string, runId: string) {
  const result = await client
    .from("grow_logs")
    .insert({
      owner_id: ownerId,
      stage: "grain",
      title: `Runtime provider failure ${runId}`,
      body: `${GROW_LOG_BODY_SENTINEL}. Visible white colonization progressed evenly over four days.`,
    })
    .select("id, owner_id, stage, title, body, created_at, updated_at")
    .single()
    .overrideTypes<GrowLogRecord, { merge: false }>();

  expectNoError(result.error, "insert runtime provider-failure grow log");
  assert(result.data, "insert runtime provider-failure grow log: missing persisted row");

  return result.data;
}

async function readGrowLog(admin: SupabaseClient, growLogId: string) {
  const result = await admin
    .from("grow_logs")
    .select("id, owner_id, stage, title, body, created_at, updated_at")
    .eq("id", growLogId)
    .single()
    .overrideTypes<GrowLogRecord, { merge: false }>();

  expectNoError(result.error, "read runtime provider-failure grow-log oracle");
  assert(result.data, "read runtime provider-failure grow-log oracle: missing row");

  return result.data;
}

async function readAdmissionState(admin: SupabaseClient, ownerId: string) {
  const admission = await admin
    .from("diagnosis_admission")
    .select("*")
    .eq("owner_id", ownerId)
    .overrideTypes<AdmissionState[], { merge: false }>();
  expectNoError(admission.error, "read diagnosis admission oracle");
  assert.equal(admission.data?.length, 1, "read diagnosis admission oracle: expected exactly one row");
  const admissionRow = admission.data[0];
  assert(admissionRow, "read diagnosis admission oracle: missing row");

  const cooldowns = await admin
    .from("diagnosis_admission_cooldowns")
    .select("*")
    .eq("owner_id", ownerId)
    .overrideTypes<CooldownState[], { merge: false }>();
  expectNoError(cooldowns.error, "read diagnosis cooldown oracle");

  return {
    admission: admissionRow,
    cooldowns: cooldowns.data ?? [],
  };
}

async function assertPersistedProviderFailure(
  admin: SupabaseClient,
  principal: { id: string; client: SupabaseClient },
  growLogBefore: GrowLogRecord,
) {
  const question = `${QUESTION_SENTINEL}. Is this grain colonization progressing normally after the latest visible change?`;
  const response = await diagnoseSelectedLog(
    principal.client,
    principal.id,
    {
      growLogId: growLogBefore.id,
      question,
    },
    {
      createProvider: () => createDiagnosisProvider(undefined),
    },
  );
  const parsedResponse = diagnosisApiResponseSchema.safeParse(response);

  assert.equal(parsedResponse.success, true, "provider failure must satisfy the public diagnosis response schema");
  assert.equal(response.ok, false, "missing provider configuration must fail");

  assert.equal(response.error.code, "provider_failed", "missing provider configuration must remain provider_failed");
  assert.equal(response.error.retryable, true, "missing provider configuration must remain retryable");

  const growLogAfter = await readGrowLog(admin, growLogBefore.id);
  assert.deepEqual(growLogAfter, growLogBefore, "provider failure mutated the grow-log row");

  const { admission, cooldowns } = await readAdmissionState(admin, principal.id);
  assert.equal(admission.attempt_count, 1, "provider failure must retain exactly one admitted attempt");
  assert.equal(admission.active_claim_id, null, "provider failure must release the active claim ID");
  assert.equal(admission.active_expires_at, null, "provider failure must clear the active lease expiry");
  assert.equal(cooldowns.length, 1, "provider failure must retain exactly one cooldown fingerprint");
  assert.equal(cooldowns[0]?.owner_id, principal.id, "cooldown owner mismatch");
  assert.match(cooldowns[0]?.fingerprint ?? "", /^[0-9a-f]{64}$/, "cooldown must persist only an opaque fingerprint");
  assertNoContentInAdmissionState(admission, cooldowns, [
    question,
    growLogBefore.title,
    growLogBefore.body,
    response.error.message,
  ]);
}

async function main() {
  const { forceFailureAfterOracle } = parseArguments();
  const url = requireEnv("SUPABASE_URL");
  await assertLoopbackUrl(url);

  const anonKey = requireEnv("SUPABASE_ANON_KEY");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createNodeClient(url, serviceRoleKey);
  const runId = randomUUID();
  let generatedUserId: string | undefined;
  let runError: unknown;
  let cleanupError: Error | undefined;

  try {
    const principal = await createFixtureUser(admin, url, anonKey, runId);
    generatedUserId = principal.id;
    process.stdout.write(`Created generated fixture user ${principal.id} (${principal.email}).\n`);

    const growLogBefore = await insertGrowLog(principal.client, principal.id, runId);
    await assertPersistedProviderFailure(admin, principal, growLogBefore);

    process.stdout.write(
      "Runtime provider-failure oracle passed: one attempt/cooldown retained, active lease released, grow log unchanged, and no diagnosis/provider content persisted.\n",
    );

    if (forceFailureAfterOracle) {
      throw new Error("Forced failure after persisted-state oracle.");
    }
  } catch (error) {
    runError = error;
  } finally {
    if (generatedUserId) {
      const deleted = await admin.auth.admin.deleteUser(generatedUserId, false);

      if (deleted.error) {
        cleanupError = new Error(`Fixture cleanup failed for ${generatedUserId}: ${deleted.error.message}`);
      }
    }

    process.stdout.write(`Cleanup attempted for ${generatedUserId ? 1 : 0} generated fixture user(s).\n`);
  }

  if (cleanupError) {
    throw new Error(cleanupError.message, { cause: runError });
  }

  process.stdout.write(`Cleanup complete: hard-deleted ${generatedUserId ? 1 : 0} generated fixture user(s).\n`);

  if (runError instanceof Error) {
    throw runError;
  }

  if (runError !== undefined) {
    throw new Error("Runtime provider-failure smoke failed with a non-Error value.", { cause: runError });
  }
}

await main();
