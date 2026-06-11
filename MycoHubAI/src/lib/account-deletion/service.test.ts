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

const {
  getAccountDeletionRequestByUserIdMock,
  markAccountDeletionRequestSoftDeletedMock,
  upsertAccountDeletionRequestMock,
  updateAccountDeletionAttemptMock,
} = vi.hoisted(() => ({
  getAccountDeletionRequestByUserIdMock: vi.fn(),
  markAccountDeletionRequestSoftDeletedMock: vi.fn(),
  upsertAccountDeletionRequestMock: vi.fn(),
  updateAccountDeletionAttemptMock: vi.fn(),
}));

vi.mock("@/lib/account-deletion/repository", () => ({
  getAccountDeletionRequestByUserId: getAccountDeletionRequestByUserIdMock,
  markAccountDeletionRequestSoftDeleted: markAccountDeletionRequestSoftDeletedMock,
  upsertAccountDeletionRequest: upsertAccountDeletionRequestMock,
  updateAccountDeletionAttempt: updateAccountDeletionAttemptMock,
}));

describe("requestAccountDeletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("soft deletes the user with shouldSoftDelete=true and records the attempt", async () => {
    const adminClient = { auth: { admin: { deleteUser: vi.fn() } } } as unknown as AccountDeletionAdminClient;
    const deleteUserMock = vi.fn().mockResolvedValue(null);
    getAccountDeletionRequestByUserIdMock.mockResolvedValue(null);
    upsertAccountDeletionRequestMock.mockResolvedValue({
      ...existingRequest,
      attemptCount: 0,
      lastError: null,
    });
    updateAccountDeletionAttemptMock.mockResolvedValue({
      ...existingRequest,
      lastAttemptAt: "2026-06-11T10:00:00.000Z",
      attemptCount: 1,
      lastError: null,
    });
    markAccountDeletionRequestSoftDeletedMock.mockResolvedValue({
      ...existingRequest,
      softDeletedAt: "2026-06-11T10:00:00.000Z",
      lastAttemptAt: "2026-06-11T10:00:00.000Z",
      attemptCount: 1,
      lastError: null,
    });

    const result: Awaited<ReturnType<typeof requestAccountDeletion>> = await requestAccountDeletion("owner-1", {
      adminClient,
      now: new Date("2026-06-11T10:00:00.000Z"),
      softDeleteUser: deleteUserMock,
    });

    expect(result).toEqual({
      status: "success",
      request: {
        ...existingRequest,
        softDeletedAt: "2026-06-11T10:00:00.000Z",
        lastAttemptAt: "2026-06-11T10:00:00.000Z",
        attemptCount: 1,
        lastError: null,
      },
    });
    expect(deleteUserMock).toHaveBeenCalledWith(adminClient, "owner-1");
    expect(upsertAccountDeletionRequestMock).toHaveBeenCalledWith(adminClient, {
      userId: "owner-1",
      requestedAt: "2026-06-11T10:00:00.000Z",
      purgeAfter: "2026-07-11T10:00:00.000Z",
      softDeletedAt: null,
      lastAttemptAt: null,
      attemptCount: 0,
      lastError: null,
    });
    expect(updateAccountDeletionAttemptMock).toHaveBeenCalledWith(adminClient, {
      userId: "owner-1",
      lastAttemptAt: "2026-06-11T10:00:00.000Z",
      attemptCount: 1,
      lastError: null,
    });
    expect(markAccountDeletionRequestSoftDeletedMock).toHaveBeenCalledWith(adminClient, {
      userId: "owner-1",
      softDeletedAt: "2026-06-11T10:00:00.000Z",
      lastAttemptAt: "2026-06-11T10:00:00.000Z",
      attemptCount: 1,
    });
  });

  it("returns missing_admin_config when the admin client is absent", async () => {
    const result = await requestAccountDeletion("owner-1", { adminClient: null });

    expect(result).toEqual({ status: "missing_admin_config" });
    expect(getAccountDeletionRequestByUserIdMock).not.toHaveBeenCalled();
  });

  it("returns already_pending when the request already exists without an error", async () => {
    getAccountDeletionRequestByUserIdMock.mockResolvedValue({
      ...existingRequest,
      softDeletedAt: "2026-06-11T10:00:00.000Z",
    });

    const result: Awaited<ReturnType<typeof requestAccountDeletion>> = await requestAccountDeletion("owner-1", {
      adminClient: {} as AccountDeletionAdminClient,
    });

    expect(result).toEqual({
      status: "already_pending",
      request: {
        ...existingRequest,
        softDeletedAt: "2026-06-11T10:00:00.000Z",
      },
    });
    expect(upsertAccountDeletionRequestMock).not.toHaveBeenCalled();
  });

  it("records failure metadata when the soft delete call fails", async () => {
    const adminClient = {} as AccountDeletionAdminClient;
    const deleteUserMock = vi.fn().mockResolvedValue({ message: "delete failed" });
    getAccountDeletionRequestByUserIdMock.mockResolvedValue(null);
    upsertAccountDeletionRequestMock.mockResolvedValue(existingRequest);
    updateAccountDeletionAttemptMock.mockResolvedValue({
      ...existingRequest,
      lastAttemptAt: "2026-06-11T10:00:00.000Z",
      attemptCount: 1,
      lastError: "delete failed",
    });

    const result: Awaited<ReturnType<typeof requestAccountDeletion>> = await requestAccountDeletion("owner-1", {
      adminClient,
      now: new Date("2026-06-11T10:00:00.000Z"),
      softDeleteUser: deleteUserMock,
    });

    expect(result).toEqual({
      status: "unexpected_failure",
      request: {
        ...existingRequest,
        lastAttemptAt: "2026-06-11T10:00:00.000Z",
        attemptCount: 1,
        lastError: "delete failed",
      },
      error: "delete failed",
    });
  });
});
