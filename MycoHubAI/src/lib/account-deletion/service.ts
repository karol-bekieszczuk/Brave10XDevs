import type { AuthError } from "@supabase/supabase-js";
import {
  claimAccountDeletionProcessing,
  finalizeAccountDeletionProcessing,
  releaseAccountDeletionProcessing,
  type AccountDeletionAdminClient,
} from "@/lib/account-deletion/repository";
import type { AccountDeletionRequest } from "@/lib/account-deletion/types";

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
  const cause = error instanceof Error ? error.cause : undefined;
  const message = `${getErrorMessage(error)} ${cause === undefined ? "" : getErrorMessage(cause)}`.toLowerCase();

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

function isAlreadyDeletedError(error: AuthError) {
  const code = "code" in error && typeof error.code === "string" ? error.code.toLowerCase() : "";
  const message = error.message.toLowerCase();

  return code === "user_not_found" || message.includes("user not found") || message.includes("user does not exist");
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

  const softDeleteUser = dependencies.softDeleteUser ?? defaultSoftDeleteUser;
  const claimId = crypto.randomUUID();
  let claimHeld = false;

  try {
    const claim = await claimAccountDeletionProcessing(adminClient, userId, claimId);

    if (!claim.claimed) {
      return { status: "already_pending", request: claim.request };
    }

    claimHeld = true;

    const error = await softDeleteUser(adminClient, userId);

    if (error && isAdminConfigError(error)) {
      return { status: "missing_admin_config" };
    }

    const succeeded = !error || isAlreadyDeletedError(error);
    const finalizedRequest = await finalizeAccountDeletionProcessing(adminClient, {
      userId,
      claimId,
      succeeded,
    });
    claimHeld = false;

    if (!succeeded) {
      return {
        status: "unexpected_failure",
        request: finalizedRequest,
        error: "Account deletion failed.",
      };
    }

    return { status: "success", request: finalizedRequest };
  } catch (error) {
    if (isAdminConfigError(error)) {
      return { status: "missing_admin_config" };
    }

    return {
      status: "unexpected_failure",
      request: null,
      error: getErrorMessage(error),
    };
  } finally {
    if (claimHeld) {
      try {
        await releaseAccountDeletionProcessing(adminClient, userId, claimId);
      } catch {
        // The two-minute database lease is the fail-safe when an explicit release cannot be persisted.
      }
    }
  }
}
