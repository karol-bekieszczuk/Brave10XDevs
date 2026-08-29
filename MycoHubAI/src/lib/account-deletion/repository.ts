import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountDeletionRequest } from "@/lib/account-deletion/types";

const ACCOUNT_DELETION_SELECT =
  "user_id, requested_at, purge_after, soft_deleted_at, last_attempt_at, attempt_count, last_error";
const OWNER_ACCOUNT_DELETION_SELECT =
  "user_id, requested_at, purge_after, soft_deleted_at, last_attempt_at, attempt_count";

export type AccountDeletionClient = Pick<SupabaseClient, "from">;
export type AccountDeletionAdminClient = Pick<SupabaseClient, "auth" | "from" | "rpc">;

interface AccountDeletionClaimRecord extends AccountDeletionRequestRecord {
  claimed: boolean;
}

interface AccountDeletionClaimRpcResult {
  data: unknown;
  error: unknown;
}

export interface AccountDeletionRequestRecord {
  user_id: string;
  requested_at: string;
  purge_after: string;
  soft_deleted_at: string | null;
  last_attempt_at: string | null;
  attempt_count: number;
  last_error: string | null;
}

type OwnerAccountDeletionRequestRecord = Omit<AccountDeletionRequestRecord, "last_error">;

export interface UpsertAccountDeletionRequestInput {
  userId: string;
  requestedAt: string;
  purgeAfter: string;
  softDeletedAt?: string | null;
  lastAttemptAt?: string | null;
  attemptCount?: number;
  lastError?: string | null;
}

export interface MarkAccountDeletionRequestSoftDeletedInput {
  userId: string;
  softDeletedAt: string;
  lastAttemptAt: string;
  attemptCount: number;
  claimId: string;
}

export interface UpdateAccountDeletionAttemptInput {
  userId: string;
  lastAttemptAt: string;
  attemptCount: number;
  lastError: string | null;
}

function getAccountDeletionTable(client: Pick<SupabaseClient, "from">) {
  return client.from("account_deletion_requests");
}

export function mapAccountDeletionRequestRow(record: AccountDeletionRequestRecord): AccountDeletionRequest {
  return {
    userId: record.user_id,
    requestedAt: record.requested_at,
    purgeAfter: record.purge_after,
    softDeletedAt: record.soft_deleted_at,
    lastAttemptAt: record.last_attempt_at,
    attemptCount: record.attempt_count,
    lastError: record.last_error,
  };
}

function mapOwnerAccountDeletionRequestRow(record: OwnerAccountDeletionRequestRecord): AccountDeletionRequest {
  return mapAccountDeletionRequestRow({ ...record, last_error: null });
}

export async function getOwnerAccountDeletionRequest(client: AccountDeletionClient, userId: string) {
  const { data, error } = await getAccountDeletionTable(client)
    .select(OWNER_ACCOUNT_DELETION_SELECT)
    .eq("user_id", userId)
    .not("soft_deleted_at", "is", null)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapOwnerAccountDeletionRequestRow(data satisfies OwnerAccountDeletionRequestRecord) : null;
}

export async function getAccountDeletionRequestByUserId(client: AccountDeletionAdminClient, userId: string) {
  const { data, error } = await getAccountDeletionTable(client)
    .select(ACCOUNT_DELETION_SELECT)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapAccountDeletionRequestRow(data satisfies AccountDeletionRequestRecord) : null;
}

export async function claimAccountDeletionProcessing(
  client: AccountDeletionAdminClient,
  userId: string,
  claimId: string,
) {
  const { data, error } = (await client.rpc("claim_account_deletion_processing", {
    p_user_id: userId,
    p_claim_id: claimId,
  })) as unknown as AccountDeletionClaimRpcResult;

  if (error) {
    throw new Error("Account deletion claim RPC failed.", { cause: error });
  }

  const row = (Array.isArray(data) ? data[0] : data) as AccountDeletionClaimRecord | null;

  if (!row || typeof row.claimed !== "boolean") {
    throw new Error("Invalid account deletion claim response.");
  }

  return { claimed: row.claimed, request: mapAccountDeletionRequestRow(row) };
}

export async function finalizeAccountDeletionProcessing(
  client: AccountDeletionAdminClient,
  input: { userId: string; claimId: string; succeeded: boolean },
) {
  const { data, error } = (await client.rpc("finalize_account_deletion_processing", {
    p_user_id: input.userId,
    p_claim_id: input.claimId,
    p_succeeded: input.succeeded,
    p_error_code: input.succeeded ? null : "admin_delete_failed",
  })) as unknown as AccountDeletionClaimRpcResult;

  if (error) {
    throw new Error("Account deletion finalization RPC failed.", { cause: error });
  }

  const row = (Array.isArray(data) ? data[0] : data) as AccountDeletionRequestRecord | null;

  if (!row) {
    throw new Error("Account deletion processing claim is no longer active.");
  }

  return mapAccountDeletionRequestRow(row);
}

export async function releaseAccountDeletionProcessing(
  client: AccountDeletionAdminClient,
  userId: string,
  claimId: string,
) {
  const { error } = await getAccountDeletionTable(client)
    .update({ processing_claim_id: null, processing_expires_at: null })
    .eq("user_id", userId)
    .eq("processing_claim_id", claimId);

  if (error) {
    throw error;
  }
}

export async function upsertAccountDeletionRequest(
  client: AccountDeletionClient,
  input: UpsertAccountDeletionRequestInput,
) {
  const { data, error } = await getAccountDeletionTable(client)
    .upsert(
      {
        user_id: input.userId,
        requested_at: input.requestedAt,
        purge_after: input.purgeAfter,
        soft_deleted_at: input.softDeletedAt ?? null,
        last_attempt_at: input.lastAttemptAt ?? null,
        attempt_count: input.attemptCount ?? 0,
        last_error: input.lastError ?? null,
      },
      { onConflict: "user_id" },
    )
    .select(ACCOUNT_DELETION_SELECT)
    .single();

  if (error) {
    throw error;
  }

  return mapAccountDeletionRequestRow(data satisfies AccountDeletionRequestRecord);
}

export async function markAccountDeletionRequestSoftDeleted(
  client: AccountDeletionClient,
  input: MarkAccountDeletionRequestSoftDeletedInput,
) {
  const { data, error } = await getAccountDeletionTable(client)
    .update({
      soft_deleted_at: input.softDeletedAt,
      last_attempt_at: input.lastAttemptAt,
      attempt_count: input.attemptCount,
      last_error: null,
      processing_claim_id: null,
      processing_expires_at: null,
    })
    .eq("user_id", input.userId)
    .eq("processing_claim_id", input.claimId)
    .select(ACCOUNT_DELETION_SELECT)
    .single();

  if (error) {
    throw error;
  }

  return mapAccountDeletionRequestRow(data satisfies AccountDeletionRequestRecord);
}

export async function updateAccountDeletionAttempt(
  client: AccountDeletionClient,
  input: UpdateAccountDeletionAttemptInput,
) {
  const { data, error } = await getAccountDeletionTable(client)
    .update({
      last_attempt_at: input.lastAttemptAt,
      attempt_count: input.attemptCount,
      last_error: input.lastError,
    })
    .eq("user_id", input.userId)
    .select(ACCOUNT_DELETION_SELECT)
    .single();

  if (error) {
    throw error;
  }

  return mapAccountDeletionRequestRow(data satisfies AccountDeletionRequestRecord);
}

export async function deleteAccountDeletionRequest(client: AccountDeletionClient, userId: string) {
  const { error } = await getAccountDeletionTable(client).delete().eq("user_id", userId);

  if (error) {
    throw error;
  }
}

export async function listUnfinalizedAccountDeletionRequests(client: AccountDeletionClient) {
  const { data, error } = await getAccountDeletionTable(client)
    .select(ACCOUNT_DELETION_SELECT)
    .is("soft_deleted_at", null)
    .order("requested_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data satisfies AccountDeletionRequestRecord[]).map(mapAccountDeletionRequestRow);
}

export async function listDueAccountDeletionRequests(client: AccountDeletionClient, now: string) {
  const { data, error } = await getAccountDeletionTable(client)
    .select(ACCOUNT_DELETION_SELECT)
    .lte("purge_after", now)
    .not("soft_deleted_at", "is", null)
    .order("purge_after", { ascending: true });

  if (error) {
    throw error;
  }

  return (data satisfies AccountDeletionRequestRecord[]).map(mapAccountDeletionRequestRow);
}
