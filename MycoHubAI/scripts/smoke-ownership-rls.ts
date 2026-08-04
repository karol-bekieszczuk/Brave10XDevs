import assert from "node:assert/strict";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { diagnoseSelectedLog } from "@/lib/diagnosis/service";

const GENERATED_EMAIL_PREFIX = "mycohub-rls-";

interface FixtureUser {
  id: string;
  email: string;
  client: SupabaseClient;
  accessToken: string;
}

interface GrowLogFixture {
  id: string;
  owner_id: string;
  stage: "agar" | "grain";
  title: string;
  body: string;
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

function expectDenied(error: { message: string } | null, label: string) {
  assert.notEqual(error, null, `${label}: expected the database to reject the operation`);
}

async function createFixtureUser(
  admin: SupabaseClient,
  url: string,
  anonKey: string,
  runId: string,
  principal: "a" | "b",
  generatedUserIds: string[],
): Promise<FixtureUser> {
  const email = `${GENERATED_EMAIL_PREFIX}${runId}-${principal}@example.test`;
  const password = `Rls-${randomUUID()}-Aa1!`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });

  expectNoError(created.error, `create principal ${principal.toUpperCase()}`);
  assert(created.data.user, `create principal ${principal.toUpperCase()}: missing user`);
  assert(
    created.data.user.email?.startsWith(GENERATED_EMAIL_PREFIX),
    "refusing to track a non-fixture user for cleanup",
  );
  generatedUserIds.push(created.data.user.id);

  const client = createNodeClient(url, anonKey);
  const signedIn = await client.auth.signInWithPassword({ email, password });

  expectNoError(signedIn.error, `sign in principal ${principal.toUpperCase()}`);
  assert(signedIn.data.session, `sign in principal ${principal.toUpperCase()}: missing session`);
  assert.equal(signedIn.data.user.id, created.data.user.id, `principal ${principal.toUpperCase()} JWT user mismatch`);

  return {
    id: created.data.user.id,
    email,
    client,
    accessToken: signedIn.data.session.access_token,
  };
}

async function insertGrowLog(
  client: SupabaseClient,
  values: Omit<GrowLogFixture, "id">,
  label: string,
): Promise<GrowLogFixture> {
  const result = await client
    .from("grow_logs")
    .insert(values)
    .select("id, owner_id, stage, title, body")
    .single()
    .overrideTypes<GrowLogFixture, { merge: false }>();

  expectNoError(result.error, label);
  assert(result.data, `${label}: missing persisted row`);
  return result.data;
}

async function readAdminGrowLogs(admin: SupabaseClient, ids: string[]) {
  const result = await admin
    .from("grow_logs")
    .select("id, owner_id, stage, title, body")
    .in("id", ids)
    .order("id", { ascending: true })
    .overrideTypes<GrowLogFixture[], { merge: false }>();

  expectNoError(result.error, "admin grow-log oracle");
  return result.data ?? [];
}

async function assertGrowLogRls(admin: SupabaseClient, a: FixtureUser, b: FixtureUser) {
  const exactTitle = "A".repeat(160);
  const exactBody = "b".repeat(8_000);
  const aSelected = await insertGrowLog(
    a.client,
    { owner_id: a.id, stage: "agar", title: "A selected", body: "Healthy agar growth with visible detail." },
    "A inserts selected row",
  );
  const aSurvivor = await insertGrowLog(
    a.client,
    { owner_id: a.id, stage: "grain", title: exactTitle, body: exactBody },
    "A inserts exact-limit survivor",
  );
  const bSurvivor = await insertGrowLog(
    b.client,
    { owner_id: b.id, stage: "grain", title: "B survivor", body: "B private grain observation." },
    "B inserts survivor",
  );

  assert.notEqual(a.accessToken, b.accessToken, "principals must use distinct JWT sessions");

  const aList = await a.client
    .from("grow_logs")
    .select("id, owner_id")
    .overrideTypes<Pick<GrowLogFixture, "id" | "owner_id">[], { merge: false }>();
  expectNoError(aList.error, "A lists own rows");
  assert.deepEqual(
    new Set((aList.data ?? []).map((row) => row.id)),
    new Set([aSelected.id, aSurvivor.id]),
    "A list must contain only A rows",
  );

  const hiddenDetail = await a.client
    .from("grow_logs")
    .select("id")
    .eq("id", bSurvivor.id)
    .maybeSingle()
    .overrideTypes<Pick<GrowLogFixture, "id"> | null, { merge: false }>();
  expectNoError(hiddenDetail.error, "A selects B detail");
  assert.equal(hiddenDetail.data, null, "B detail must be invisible to A");

  const crossUpdate = await a.client
    .from("grow_logs")
    .update({ body: "COMPROMISED" })
    .eq("id", bSurvivor.id)
    .select("id")
    .overrideTypes<Pick<GrowLogFixture, "id">[], { merge: false }>();
  expectNoError(crossUpdate.error, "A cross-owner update");
  assert.deepEqual(crossUpdate.data, [], "A cross-owner update must affect zero rows");

  const crossDelete = await a.client
    .from("grow_logs")
    .delete()
    .eq("id", bSurvivor.id)
    .select("id")
    .overrideTypes<Pick<GrowLogFixture, "id">[], { merge: false }>();
  expectNoError(crossDelete.error, "A cross-owner delete");
  assert.deepEqual(crossDelete.data, [], "A cross-owner delete must affect zero rows");

  const mismatchedInsert = await a.client.from("grow_logs").insert({
    owner_id: b.id,
    stage: "agar",
    title: "Mismatched owner marker",
    body: "Must not persist.",
  });
  expectDenied(mismatchedInsert.error, "A mismatched-owner insert");

  const ownerReassignment = await a.client
    .from("grow_logs")
    .update({ owner_id: b.id })
    .eq("id", aSelected.id)
    .select("id");
  expectDenied(ownerReassignment.error, "A owner reassignment");

  const invalidRows = [
    { owner_id: a.id, stage: "fruiting", title: "Invalid stage", body: "Must fail." },
    { owner_id: a.id, stage: "agar", title: " ", body: "Must fail." },
    { owner_id: a.id, stage: "agar", title: "Blank body", body: "  " },
    { owner_id: a.id, stage: "agar", title: "T".repeat(161), body: "Must fail." },
    { owner_id: a.id, stage: "grain", title: "Oversized body", body: "B".repeat(8_001) },
  ];

  for (const [index, values] of invalidRows.entries()) {
    const result = await a.client.from("grow_logs").insert(values);
    expectDenied(result.error, `database constraint case ${index + 1}`);
  }

  const beforeMixedDelete = await readAdminGrowLogs(admin, [aSelected.id, aSurvivor.id, bSurvivor.id]);
  assert.deepEqual(
    new Set(beforeMixedDelete.map((row) => row.id)),
    new Set([aSelected.id, aSurvivor.id, bSurvivor.id]),
    "denied writes and constraint failures must leave all seeded rows intact",
  );
  assert.equal(
    beforeMixedDelete.find((row) => row.id === aSelected.id)?.owner_id,
    a.id,
    "owner reassignment persisted",
  );
  assert.equal(
    beforeMixedDelete.find((row) => row.id === bSurvivor.id)?.body,
    bSurvivor.body,
    "cross-owner mutation persisted",
  );

  const mismatchedOracle = await admin
    .from("grow_logs")
    .select("id")
    .eq("title", "Mismatched owner marker")
    .overrideTypes<{ id: string }[], { merge: false }>();
  expectNoError(mismatchedOracle.error, "mismatched-owner insert oracle");
  assert.deepEqual(mismatchedOracle.data, [], "mismatched-owner insert persisted");

  let providerConstructions = 0;
  const diagnosis = await diagnoseSelectedLog(
    a.client,
    a.id,
    { growLogId: bSurvivor.id, question: "Is this grain colonization progressing normally?" },
    {
      createProvider: () => {
        providerConstructions += 1;
        throw new Error("provider must not be constructed for a non-owner row");
      },
    },
  );
  assert.equal(diagnosis.ok, false, "non-owner diagnosis must fail");
  assert.equal(diagnosis.error.code, "grow_log_not_found", "non-owner diagnosis must use generic not-found");
  assert.equal(providerConstructions, 0, "non-owner diagnosis must start no provider work");

  const mixedDelete = await a.client
    .from("grow_logs")
    .delete()
    .in("id", [aSelected.id, bSurvivor.id])
    .select("id")
    .overrideTypes<Pick<GrowLogFixture, "id">[], { merge: false }>();
  expectNoError(mixedDelete.error, "A mixed bulk delete");
  const mixedDeletedRows = mixedDelete.data ?? [];
  assert.deepEqual(
    mixedDeletedRows.map((row) => row.id),
    [aSelected.id],
    "mixed delete must remove only selected A row",
  );

  const persisted = await readAdminGrowLogs(admin, [aSelected.id, aSurvivor.id, bSurvivor.id]);
  assert.deepEqual(
    new Set(persisted.map((row) => row.id)),
    new Set([aSurvivor.id, bSurvivor.id]),
    "only unselected A and B survivors must remain",
  );
  assert.equal(persisted.find((row) => row.id === aSurvivor.id)?.owner_id, a.id, "A survivor owner changed");
  assert.equal(persisted.find((row) => row.id === aSurvivor.id)?.title, exactTitle, "exact-limit title changed");
  assert.equal(persisted.find((row) => row.id === aSurvivor.id)?.body, exactBody, "exact-limit body changed");
  assert.equal(persisted.find((row) => row.id === bSurvivor.id)?.body, bSurvivor.body, "B survivor was mutated");
}

async function assertPendingDeletionRls(admin: SupabaseClient, a: FixtureUser, b: FixtureUser) {
  for (const principal of [a, b]) {
    for (const targetId of [a.id, b.id]) {
      const attemptedInsert = await principal.client.from("account_deletion_requests").insert({ user_id: targetId });
      expectDenied(
        attemptedInsert.error,
        `${principal.id === a.id ? "A" : "B"} pending-row insert for ${targetId === principal.id ? "self" : "other"}`,
      );
    }
  }

  const fixtures = [
    {
      user_id: a.id,
      requested_at: "2030-01-01T00:00:00.000Z",
      purge_after: "2030-01-31T00:00:00.000Z",
      attempt_count: 0,
      last_error: null,
    },
    {
      user_id: b.id,
      requested_at: "2030-02-01T00:00:00.000Z",
      purge_after: "2030-03-03T00:00:00.000Z",
      attempt_count: 0,
      last_error: null,
    },
  ];
  const seeded = await admin.from("account_deletion_requests").insert(fixtures);
  expectNoError(seeded.error, "admin seeds pending-deletion rows");

  for (const principal of [a, b]) {
    const visible = await principal.client
      .from("account_deletion_requests")
      .select("user_id")
      .overrideTypes<{ user_id: string }[], { merge: false }>();
    expectNoError(visible.error, `${principal.email} reads pending state`);
    const visibleRows = visible.data ?? [];
    assert.deepEqual(
      visibleRows.map((row) => row.user_id),
      [principal.id],
      "each principal must see only its own pending row",
    );

    for (const targetId of [a.id, b.id]) {
      const updated = await principal.client
        .from("account_deletion_requests")
        .update({ attempt_count: 99, last_error: "COMPROMISED" })
        .eq("user_id", targetId)
        .select("user_id");
      assert.equal(updated.data?.length ?? 0, 0, "authenticated pending-row update must affect zero rows");

      const deleted = await principal.client
        .from("account_deletion_requests")
        .delete()
        .eq("user_id", targetId)
        .select("user_id");
      assert.equal(deleted.data?.length ?? 0, 0, "authenticated pending-row delete must affect zero rows");
    }
  }

  const oracle = await admin
    .from("account_deletion_requests")
    .select("user_id, requested_at, purge_after, attempt_count, last_error")
    .in("user_id", [a.id, b.id])
    .order("user_id", { ascending: true })
    .overrideTypes<
      {
        user_id: string;
        requested_at: string;
        purge_after: string;
        attempt_count: number;
        last_error: string | null;
      }[],
      { merge: false }
    >();
  expectNoError(oracle.error, "admin pending-state oracle");
  const oracleRows = oracle.data ?? [];
  assert.equal(oracleRows.length, 2, "both pending rows must survive");
  assert(
    oracleRows.every((row) => row.attempt_count === 0 && row.last_error === null),
    "pending rows were mutated",
  );
}

async function main() {
  const url = requireEnv("SUPABASE_URL");
  await assertLoopbackUrl(url);

  const anonKey = requireEnv("SUPABASE_ANON_KEY");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createNodeClient(url, serviceRoleKey);
  const runId = randomUUID();
  const generatedUserIds: string[] = [];
  let runError: unknown;
  const cleanupErrors: string[] = [];

  try {
    const a = await createFixtureUser(admin, url, anonKey, runId, "a", generatedUserIds);
    const b = await createFixtureUser(admin, url, anonKey, runId, "b", generatedUserIds);

    await assertGrowLogRls(admin, a, b);
    await assertPendingDeletionRls(admin, a, b);

    process.stdout.write(
      "Ownership/RLS smoke passed: two JWT principals, persisted survivors, constraints, diagnosis ordering, and owner-select-only pending state.\n",
    );
  } catch (error) {
    runError = error;
  } finally {
    for (const userId of [...generatedUserIds].reverse()) {
      const result = await admin.auth.admin.deleteUser(userId, false);

      if (result.error) {
        cleanupErrors.push(`${userId}: ${result.error.message}`);
      }
    }

    process.stdout.write(`Cleanup attempted for ${generatedUserIds.length} generated fixture user(s).\n`);
  }

  if (cleanupErrors.length > 0) {
    throw new Error(`Fixture cleanup failed: ${cleanupErrors.join("; ")}`, { cause: runError });
  }

  process.stdout.write(`Cleanup complete: hard-deleted ${generatedUserIds.length} generated fixture user(s).\n`);

  if (runError instanceof Error) {
    throw runError;
  }

  if (runError !== undefined) {
    throw new Error("Ownership/RLS smoke failed with a non-Error value.", { cause: runError });
  }
}

await main();
