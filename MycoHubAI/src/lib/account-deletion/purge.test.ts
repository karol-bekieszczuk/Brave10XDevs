import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountDeletionAdminClient } from "@/lib/account-deletion/repository";
import { purgeDueAccountDeletionRequests } from "@/lib/account-deletion/purge";

const { listDueAccountDeletionRequestsMock, updateAccountDeletionAttemptMock } = vi.hoisted(() => ({
  listDueAccountDeletionRequestsMock: vi.fn(),
  updateAccountDeletionAttemptMock: vi.fn(),
}));

vi.mock("@/lib/account-deletion/repository", () => ({
  listDueAccountDeletionRequests: listDueAccountDeletionRequestsMock,
  updateAccountDeletionAttempt: updateAccountDeletionAttemptMock,
}));

describe("purgeDueAccountDeletionRequests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a disabled summary when the admin client is missing", async () => {
    const result = await purgeDueAccountDeletionRequests({ adminClient: null });

    expect(result).toEqual({
      configured: false,
      processed: 0,
      deleted: 0,
      failed: 0,
    });
  });

  it("hard deletes due requests", async () => {
    const adminClient = {} as AccountDeletionAdminClient;
    const hardDeleteUser = vi.fn().mockResolvedValue(null);
    listDueAccountDeletionRequestsMock.mockResolvedValue([
      {
        userId: "owner-1",
        softDeletedAt: "2026-06-11T10:00:00.000Z",
        attemptCount: 0,
      },
    ]);

    const result = await purgeDueAccountDeletionRequests({
      adminClient,
      now: new Date("2026-07-12T10:00:00.000Z"),
      hardDeleteUser,
    });

    expect(result).toEqual({
      configured: true,
      processed: 1,
      deleted: 1,
      failed: 0,
    });
    expect(hardDeleteUser).toHaveBeenCalledWith(adminClient, "owner-1");
    expect(updateAccountDeletionAttemptMock).not.toHaveBeenCalled();
  });

  it("records failure metadata when a hard delete fails", async () => {
    const adminClient = {} as AccountDeletionAdminClient;
    const hardDeleteUser = vi.fn().mockResolvedValue({ message: "hard delete failed" });
    listDueAccountDeletionRequestsMock.mockResolvedValue([
      {
        userId: "owner-1",
        softDeletedAt: "2026-06-11T10:00:00.000Z",
        attemptCount: 2,
      },
    ]);

    const result = await purgeDueAccountDeletionRequests({
      adminClient,
      now: new Date("2026-07-12T10:00:00.000Z"),
      hardDeleteUser,
    });

    expect(result).toEqual({
      configured: true,
      processed: 1,
      deleted: 0,
      failed: 1,
    });
    expect(updateAccountDeletionAttemptMock).toHaveBeenCalledWith(adminClient, {
      userId: "owner-1",
      lastAttemptAt: "2026-07-12T10:00:00.000Z",
      attemptCount: 3,
      lastError: "hard delete failed",
    });
  });

  it("does not expose private grow-log content in the summary", async () => {
    const adminClient = {} as AccountDeletionAdminClient;
    listDueAccountDeletionRequestsMock.mockResolvedValue([]);

    const result = await purgeDueAccountDeletionRequests({
      adminClient,
      now: new Date("2026-07-12T10:00:00.000Z"),
    });

    expect(JSON.stringify(result)).not.toContain("grow log");
  });
});
