export interface AccountDeletionRequest {
  userId: string;
  requestedAt: string;
  purgeAfter: string;
  softDeletedAt: string | null;
  lastAttemptAt: string | null;
  attemptCount: number;
  lastError: string | null;
}
