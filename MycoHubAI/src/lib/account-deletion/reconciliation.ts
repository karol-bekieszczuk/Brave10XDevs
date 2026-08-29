import {
  listUnfinalizedAccountDeletionRequests,
  type AccountDeletionAdminClient,
} from "@/lib/account-deletion/repository";
import { requestAccountDeletion } from "@/lib/account-deletion/service";

export interface ReconcileAccountDeletionSummary {
  configured: boolean;
  processed: number;
  repaired: number;
  deferred: number;
  failed: number;
}

export async function reconcileUnfinalizedAccountDeletions(
  adminClient: AccountDeletionAdminClient | null,
): Promise<ReconcileAccountDeletionSummary> {
  if (!adminClient) {
    return {
      configured: false,
      processed: 0,
      repaired: 0,
      deferred: 0,
      failed: 0,
    };
  }

  const requests = await listUnfinalizedAccountDeletionRequests(adminClient);
  let repaired = 0;
  let deferred = 0;
  let failed = 0;

  for (const request of requests) {
    const result = await requestAccountDeletion(request.userId, { adminClient });

    if (result.status === "success") {
      repaired += 1;
    } else if (result.status === "already_pending") {
      deferred += 1;
    } else {
      failed += 1;
    }
  }

  return {
    configured: true,
    processed: requests.length,
    repaired,
    deferred,
    failed,
  };
}
