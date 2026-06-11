import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountDeletionRequest } from "@/lib/account-deletion/types";

const ACCOUNT_DELETION_SELECT =
  "user_id, requested_at, purge_after, soft_deleted_at, last_attempt_at, attempt_count, last_error";

export type AccountDeletionClient = SupabaseClient;
export type AccountDeletionAdminClient = SupabaseClient;

export interface AccountDeletionRequestRecord {
  user_id: string;
  requested_at: string;
  purge_after: string;
  soft_deleted_at: string | null;
  last_attempt_at: string | null;
  attempt_count: number;
  last_error: string | null;
}

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
}

export interface UpdateAccountDeletionAttemptInput {
  userId: string;
  lastAttemptAt: string;
  attemptCount: number;
  lastError: string | null;
}

function getAccountDeletionTable(client: SupabaseClient) {
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

export async function getOwnerAccountDeletionRequest(client: AccountDeletionClient, userId: string) {
  const { data, error } = await getAccountDeletionTable(client)
    .select(ACCOUNT_DELETION_SELECT)
    .eq("user_id", userId)
    .not("soft_deleted_at", "is", null)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapAccountDeletionRequestRow(data satisfies AccountDeletionRequestRecord) : null;
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

export async function upsertAccountDeletionRequest(
  client: AccountDeletionAdminClient,
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
  client: AccountDeletionAdminClient,
  input: MarkAccountDeletionRequestSoftDeletedInput,
) {
  const { data, error } = await getAccountDeletionTable(client)
    .update({
      soft_deleted_at: input.softDeletedAt,
      last_attempt_at: input.lastAttemptAt,
      attempt_count: input.attemptCount,
      last_error: null,
    })
    .eq("user_id", input.userId)
    .select(ACCOUNT_DELETION_SELECT)
    .single();

  if (error) {
    throw error;
  }

  return mapAccountDeletionRequestRow(data satisfies AccountDeletionRequestRecord);
}

export async function updateAccountDeletionAttempt(
  client: AccountDeletionAdminClient,
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

export async function deleteAccountDeletionRequest(client: AccountDeletionAdminClient, userId: string) {
  const { error } = await getAccountDeletionTable(client).delete().eq("user_id", userId);

  if (error) {
    throw error;
  }
}

export async function listDueAccountDeletionRequests(client: AccountDeletionAdminClient, now: string) {
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
