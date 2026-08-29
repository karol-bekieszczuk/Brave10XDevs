import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountDeletionAdminClient } from "@/lib/account-deletion/repository";
import type { AccountDeletionRequest } from "@/lib/account-deletion/types";
import { reconcileUnfinalizedAccountDeletions } from "@/lib/account-deletion/reconciliation";

const { listUnfinalizedAccountDeletionRequestsMock, requestAccountDeletionMock } = vi.hoisted(() => ({
  listUnfinalizedAccountDeletionRequestsMock: vi.fn(),
  requestAccountDeletionMock: vi.fn(),
}));

vi.mock("@/lib/account-deletion/repository", () => ({
  listUnfinalizedAccountDeletionRequests: listUnfinalizedAccountDeletionRequestsMock,
}));

vi.mock("@/lib/account-deletion/service", () => ({
  requestAccountDeletion: requestAccountDeletionMock,
}));

const request = (userId: string): AccountDeletionRequest => ({
  userId,
  requestedAt: "2026-06-11T10:00:00.000Z",
  purgeAfter: "2026-07-11T10:00:00.000Z",
  softDeletedAt: null,
  lastAttemptAt: null,
  attemptCount: 0,
  lastError: null,
});

describe("reconcileUnfinalizedAccountDeletions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a disabled summary without privileged configuration", async () => {
    await expect(reconcileUnfinalizedAccountDeletions(null)).resolves.toEqual({
      configured: false,
      processed: 0,
      repaired: 0,
      deferred: 0,
      failed: 0,
    });
    expect(listUnfinalizedAccountDeletionRequestsMock).not.toHaveBeenCalled();
  });

  it("repairs an unfinalized request through the existing idempotent request service", async () => {
    const adminClient = {} as AccountDeletionAdminClient;
    const unfinalized = request("owner-1");
    listUnfinalizedAccountDeletionRequestsMock.mockResolvedValue([unfinalized]);
    requestAccountDeletionMock.mockResolvedValue({
      status: "success",
      request: { ...unfinalized, softDeletedAt: "2026-06-11T10:05:00.000Z" },
    });

    await expect(reconcileUnfinalizedAccountDeletions(adminClient)).resolves.toEqual({
      configured: true,
      processed: 1,
      repaired: 1,
      deferred: 0,
      failed: 0,
    });
    expect(requestAccountDeletionMock).toHaveBeenCalledWith("owner-1", { adminClient });
  });

  it("defers active claims and continues after per-request failures", async () => {
    const adminClient = {} as AccountDeletionAdminClient;
    const active = request("owner-active");
    const failed = request("owner-failed");
    const repaired = request("owner-repaired");
    listUnfinalizedAccountDeletionRequestsMock.mockResolvedValue([active, failed, repaired]);
    requestAccountDeletionMock
      .mockResolvedValueOnce({ status: "already_pending", request: active })
      .mockResolvedValueOnce({ status: "unexpected_failure", request: failed, error: "Account deletion failed." })
      .mockResolvedValueOnce({
        status: "success",
        request: { ...repaired, softDeletedAt: "2026-06-11T10:05:00.000Z" },
      });

    await expect(reconcileUnfinalizedAccountDeletions(adminClient)).resolves.toEqual({
      configured: true,
      processed: 3,
      repaired: 1,
      deferred: 1,
      failed: 1,
    });
    expect(requestAccountDeletionMock).toHaveBeenCalledTimes(3);
  });
});
