import type { AuthError } from "@supabase/supabase-js";
import {
  getAccountDeletionRequestByUserId,
  markAccountDeletionRequestSoftDeleted,
  type AccountDeletionAdminClient,
  upsertAccountDeletionRequest,
  updateAccountDeletionAttempt,
} from "@/lib/account-deletion/repository";
import type { AccountDeletionRequest } from "@/lib/account-deletion/types";

const RETENTION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export type RequestAccountDeletionResult =
  | { status: "success"; request: AccountDeletionRequest }
  | { status: "missing_admin_config" }
  | { status: "already_pending"; request: AccountDeletionRequest }
  | { status: "unexpected_failure"; request: AccountDeletionRequest | null; error: string };

export interface RequestAccountDeletionDependencies {
  adminClient: AccountDeletionAdminClient | null;
  now?: Date;
  softDeleteUser?: (client: AccountDeletionAdminClient, userId: string) => Promise<AuthError | null>;
}

function addRetentionWindow(now: Date) {
  return new Date(now.getTime() + RETENTION_WINDOW_MS).toISOString();
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message;
  }

  return "Unknown account deletion error";
}

function isAdminConfigError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();

  return (
    message.includes("row-level security") ||
    message.includes("permission denied") ||
    message.includes("not_admin") ||
    message.includes("admin api") ||
    message.includes("invalid api key") ||
    message.includes("invalid jwt") ||
    message.includes("unauthorized")
  );
}

async function defaultSoftDeleteUser(client: AccountDeletionAdminClient, userId: string) {
  const { error } = await client.auth.admin.deleteUser(userId, true);
  return error;
}

export async function requestAccountDeletion(
  userId: string,
  dependencies: RequestAccountDeletionDependencies,
): Promise<RequestAccountDeletionResult> {
  const adminClient = dependencies.adminClient;
  if (!adminClient) {
    return { status: "missing_admin_config" };
  }

  const now = dependencies.now ?? new Date();
  const attemptTimestamp = now.toISOString();
  const softDeleteUser = dependencies.softDeleteUser ?? defaultSoftDeleteUser;

  try {
    const existing = await getAccountDeletionRequestByUserId(adminClient, userId);

    if (existing?.softDeletedAt) {
      return { status: "already_pending", request: existing };
    }

    const baseRequest = await upsertAccountDeletionRequest(adminClient, {
      userId,
      requestedAt: existing?.requestedAt ?? attemptTimestamp,
      purgeAfter: existing?.purgeAfter ?? addRetentionWindow(now),
      softDeletedAt: null,
      lastAttemptAt: existing?.lastAttemptAt ?? null,
      attemptCount: existing?.attemptCount ?? 0,
      lastError: null,
    });

    const error = await softDeleteUser(adminClient, userId);

    if (error && isAdminConfigError(error)) {
      return { status: "missing_admin_config" };
    }

    const updatedRequest = await updateAccountDeletionAttempt(adminClient, {
      userId,
      lastAttemptAt: attemptTimestamp,
      attemptCount: baseRequest.attemptCount + 1,
      lastError: error?.message ?? null,
    });

    if (error) {
      return {
        status: "unexpected_failure",
        request: updatedRequest,
        error: error.message,
      };
    }

    const softDeletedRequest = await markAccountDeletionRequestSoftDeleted(adminClient, {
      userId,
      softDeletedAt: attemptTimestamp,
      lastAttemptAt: attemptTimestamp,
      attemptCount: updatedRequest.attemptCount,
    });

    return { status: "success", request: softDeletedRequest };
  } catch (error) {
    if (isAdminConfigError(error)) {
      return { status: "missing_admin_config" };
    }

    return {
      status: "unexpected_failure",
      request: null,
      error: getErrorMessage(error),
    };
  }
}
