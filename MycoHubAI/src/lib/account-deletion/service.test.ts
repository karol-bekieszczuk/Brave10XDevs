import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountDeletionAdminClient } from "@/lib/account-deletion/repository";
import type { AccountDeletionRequest } from "@/lib/account-deletion/types";
import { requestAccountDeletion } from "@/lib/account-deletion/service";

const existingRequest: AccountDeletionRequest = {
  userId: "owner-1",
  requestedAt: "2026-06-11T10:00:00.000Z",
  purgeAfter: "2026-07-11T10:00:00.000Z",
  softDeletedAt: null,
  lastAttemptAt: null,
  attemptCount: 0,
  lastError: null,
};

const finalizedRequest: AccountDeletionRequest = {
  ...existingRequest,
  softDeletedAt: "2026-06-11T10:00:00.000Z",
  lastAttemptAt: "2026-06-11T10:00:00.000Z",
  attemptCount: 1,
};

const {
  claimAccountDeletionProcessingMock,
  finalizeAccountDeletionProcessingMock,
  releaseAccountDeletionProcessingMock,
} = vi.hoisted(() => ({
  claimAccountDeletionProcessingMock: vi.fn(),
  finalizeAccountDeletionProcessingMock: vi.fn(),
  releaseAccountDeletionProcessingMock: vi.fn(),
}));

vi.mock("@/lib/account-deletion/repository", () => ({
  claimAccountDeletionProcessing: claimAccountDeletionProcessingMock,
  finalizeAccountDeletionProcessing: finalizeAccountDeletionProcessingMock,
  releaseAccountDeletionProcessing: releaseAccountDeletionProcessingMock,
}));

describe("requestAccountDeletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    releaseAccountDeletionProcessingMock.mockResolvedValue(undefined);
  });

  it("soft deletes the authenticated user and atomically finalizes the matching claim", async () => {
    const adminClient = {} as AccountDeletionAdminClient;
    const deleteUserMock = vi.fn().mockResolvedValue(null);
    claimAccountDeletionProcessingMock.mockResolvedValue({ claimed: true, request: existingRequest });
    finalizeAccountDeletionProcessingMock.mockResolvedValue(finalizedRequest);

    const result = await requestAccountDeletion("owner-1", {
      adminClient,
      softDeleteUser: deleteUserMock,
    });

    expect(result).toEqual({ status: "success", request: finalizedRequest });
    expect(deleteUserMock).toHaveBeenCalledWith(adminClient, "owner-1");
    const claimId = claimAccountDeletionProcessingMock.mock.calls[0]?.[2] as string;
    expect(claimId).toMatch(/^[0-9a-f-]{36}$/);
    expect(finalizeAccountDeletionProcessingMock).toHaveBeenCalledWith(adminClient, {
      userId: "owner-1",
      claimId,
      succeeded: true,
    });
    expect(releaseAccountDeletionProcessingMock).not.toHaveBeenCalled();
  });

  it("returns missing_admin_config when the admin client is absent", async () => {
    await expect(requestAccountDeletion("owner-1", { adminClient: null })).resolves.toEqual({
      status: "missing_admin_config",
    });
    expect(claimAccountDeletionProcessingMock).not.toHaveBeenCalled();
  });

  it("returns missing_admin_config when the configured admin key cannot claim privileged work", async () => {
    claimAccountDeletionProcessingMock.mockRejectedValue(
      new Error('new row violates row-level security policy for table "account_deletion_requests"'),
    );

    await expect(requestAccountDeletion("owner-1", { adminClient: {} as AccountDeletionAdminClient })).resolves.toEqual(
      { status: "missing_admin_config" },
    );
    expect(finalizeAccountDeletionProcessingMock).not.toHaveBeenCalled();
  });

  it("returns the generic pending result to a concurrent claimant", async () => {
    claimAccountDeletionProcessingMock.mockResolvedValue({ claimed: false, request: existingRequest });

    await expect(requestAccountDeletion("owner-1", { adminClient: {} as AccountDeletionAdminClient })).resolves.toEqual(
      { status: "already_pending", request: existingRequest },
    );
    expect(finalizeAccountDeletionProcessingMock).not.toHaveBeenCalled();
  });

  it("persists only a controlled failure code and releases through atomic finalization", async () => {
    const adminClient = {} as AccountDeletionAdminClient;
    const failedRequest = { ...finalizedRequest, softDeletedAt: null, lastError: "admin_delete_failed" };
    claimAccountDeletionProcessingMock.mockResolvedValue({ claimed: true, request: existingRequest });
    finalizeAccountDeletionProcessingMock.mockResolvedValue(failedRequest);

    const result = await requestAccountDeletion("owner-1", {
      adminClient,
      softDeleteUser: vi.fn().mockResolvedValue({ message: "PRIVATE_ADMIN_DETAIL" }),
    });

    expect(result).toEqual({
      status: "unexpected_failure",
      request: failedRequest,
      error: "Account deletion failed.",
    });
    const failureFinalizeInput = finalizeAccountDeletionProcessingMock.mock.calls[0]?.[1] as {
      userId: string;
      claimId: string;
      succeeded: boolean;
    };
    expect(failureFinalizeInput).toEqual({
      userId: "owner-1",
      claimId: failureFinalizeInput.claimId,
      succeeded: false,
    });
    expect(failureFinalizeInput.claimId).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(result)).not.toContain("PRIVATE_ADMIN_DETAIL");
    expect(releaseAccountDeletionProcessingMock).not.toHaveBeenCalled();
  });

  it("retries safely when Admin succeeded but finalization failed", async () => {
    const adminClient = {} as AccountDeletionAdminClient;
    const deleteUserMock = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ message: "User not found", code: "user_not_found" });
    claimAccountDeletionProcessingMock.mockResolvedValue({ claimed: true, request: existingRequest });
    finalizeAccountDeletionProcessingMock
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValueOnce(finalizedRequest);

    const first = await requestAccountDeletion("owner-1", { adminClient, softDeleteUser: deleteUserMock });
    const second = await requestAccountDeletion("owner-1", { adminClient, softDeleteUser: deleteUserMock });

    expect(first.status).toBe("unexpected_failure");
    expect(second).toEqual({ status: "success", request: finalizedRequest });
    expect(releaseAccountDeletionProcessingMock).toHaveBeenCalledTimes(1);
    const retryFinalizeInput = finalizeAccountDeletionProcessingMock.mock.calls[1]?.[1] as {
      userId: string;
      claimId: string;
      succeeded: boolean;
    };
    expect(retryFinalizeInput).toEqual({
      userId: "owner-1",
      claimId: retryFinalizeInput.claimId,
      succeeded: true,
    });
    expect(retryFinalizeInput.claimId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("allows exactly one Admin API call across concurrent requests", async () => {
    const adminClient = {} as AccountDeletionAdminClient;
    let resolveDelete!: (value: null) => void;
    const heldDelete = new Promise<null>((resolve) => {
      resolveDelete = resolve;
    });
    const deleteUserMock = vi.fn().mockReturnValue(heldDelete);
    claimAccountDeletionProcessingMock
      .mockResolvedValueOnce({ claimed: true, request: existingRequest })
      .mockResolvedValueOnce({ claimed: false, request: existingRequest });
    finalizeAccountDeletionProcessingMock.mockResolvedValue(finalizedRequest);

    const first = requestAccountDeletion("owner-1", { adminClient, softDeleteUser: deleteUserMock });
    await vi.waitFor(() => {
      expect(deleteUserMock).toHaveBeenCalledTimes(1);
    });
    const second = requestAccountDeletion("owner-1", { adminClient, softDeleteUser: deleteUserMock });

    await expect(second).resolves.toEqual({ status: "already_pending", request: existingRequest });
    expect(deleteUserMock).toHaveBeenCalledTimes(1);
    resolveDelete(null);
    await expect(first).resolves.toEqual({ status: "success", request: finalizedRequest });
  });
});
