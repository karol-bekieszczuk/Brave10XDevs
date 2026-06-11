import type { AuthError } from "@supabase/supabase-js";
import {
  listDueAccountDeletionRequests,
  type AccountDeletionAdminClient,
  updateAccountDeletionAttempt,
} from "@/lib/account-deletion/repository";

export interface PurgeAccountDeletionSummary {
  configured: boolean;
  processed: number;
  deleted: number;
  failed: number;
}

export interface PurgeAccountDeletionDependencies {
  adminClient: AccountDeletionAdminClient | null;
  now?: Date;
  hardDeleteUser?: (client: AccountDeletionAdminClient, userId: string) => Promise<AuthError | null>;
}

async function defaultHardDeleteUser(client: AccountDeletionAdminClient, userId: string) {
  const { error } = await client.auth.admin.deleteUser(userId, false);
  return error;
}

export async function purgeDueAccountDeletionRequests(
  dependencies: PurgeAccountDeletionDependencies,
): Promise<PurgeAccountDeletionSummary> {
  const adminClient = dependencies.adminClient;
  if (!adminClient) {
    return {
      configured: false,
      processed: 0,
      deleted: 0,
      failed: 0,
    };
  }

  const now = dependencies.now ?? new Date();
  const hardDeleteUser = dependencies.hardDeleteUser ?? defaultHardDeleteUser;
  const dueRequests = await listDueAccountDeletionRequests(adminClient, now.toISOString());

  let deleted = 0;
  let failed = 0;

  for (const request of dueRequests) {
    const error = await hardDeleteUser(adminClient, request.userId);

    if (!error) {
      deleted += 1;
      continue;
    }

    failed += 1;
    await updateAccountDeletionAttempt(adminClient, {
      userId: request.userId,
      lastAttemptAt: now.toISOString(),
      attemptCount: request.attemptCount + 1,
      lastError: error.message,
    });
  }

  return {
    configured: true,
    processed: dueRequests.length,
    deleted,
    failed,
  };
}
