import { describe, expect, it } from "vitest";
import type { AccountDeletionClient, AccountDeletionRequestRecord } from "./repository";
import {
  getOwnerAccountDeletionRequest,
  listDueAccountDeletionRequests,
  markAccountDeletionRequestSoftDeleted,
  mapAccountDeletionRequestRow,
  updateAccountDeletionAttempt,
  upsertAccountDeletionRequest,
} from "./repository";

interface QueryResult {
  data: AccountDeletionRequestRecord | AccountDeletionRequestRecord[] | null;
  error: null;
}

class MockQueryBuilder {
  readonly actions: { type: string; args: unknown[] }[] = [];

  constructor(private readonly result: QueryResult) {}

  select(...args: unknown[]) {
    this.actions.push({ type: "select", args });
    return this;
  }

  upsert(...args: unknown[]) {
    this.actions.push({ type: "upsert", args });
    return this;
  }

  update(...args: unknown[]) {
    this.actions.push({ type: "update", args });
    return this;
  }

  eq(...args: unknown[]) {
    this.actions.push({ type: "eq", args });
    return this;
  }

  lte(...args: unknown[]) {
    this.actions.push({ type: "lte", args });
    return this;
  }

  not(...args: unknown[]) {
    this.actions.push({ type: "not", args });
    return this;
  }

  order(...args: unknown[]) {
    this.actions.push({ type: "order", args });
    return this;
  }

  maybeSingle() {
    this.actions.push({ type: "maybeSingle", args: [] });
    return this;
  }

  single() {
    this.actions.push({ type: "single", args: [] });
    return this;
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    _onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve(this.result).then(onfulfilled);
  }
}

function createMockClient(result: QueryResult) {
  const builder = new MockQueryBuilder(result);

  const client = {
    from(table: string) {
      builder.actions.push({ type: "from", args: [table] });
      return builder;
    },
  } as unknown as AccountDeletionClient;

  return { builder, client };
}

const dbRow: AccountDeletionRequestRecord = {
  user_id: "owner-1",
  requested_at: "2026-06-11T10:00:00.000Z",
  purge_after: "2026-07-11T10:00:00.000Z",
  soft_deleted_at: "2026-06-11T10:05:00.000Z",
  last_attempt_at: null,
  attempt_count: 0,
  last_error: null,
};

const requestedOnlyRow: AccountDeletionRequestRecord = {
  ...dbRow,
  soft_deleted_at: null,
};

describe("account deletion repository", () => {
  it("maps database rows into the app shape", () => {
    expect(mapAccountDeletionRequestRow(dbRow)).toEqual({
      userId: "owner-1",
      requestedAt: "2026-06-11T10:00:00.000Z",
      purgeAfter: "2026-07-11T10:00:00.000Z",
      softDeletedAt: "2026-06-11T10:05:00.000Z",
      lastAttemptAt: null,
      attemptCount: 0,
      lastError: null,
    });
  });

  it("filters owner pending lookups by user_id", async () => {
    const { builder, client } = createMockClient({ data: dbRow, error: null });

    const result = await getOwnerAccountDeletionRequest(client, "owner-1");

    expect(result).toEqual(mapAccountDeletionRequestRow(dbRow));
    expect(builder.actions).toEqual([
      { type: "from", args: ["account_deletion_requests"] },
      {
        type: "select",
        args: ["user_id, requested_at, purge_after, soft_deleted_at, last_attempt_at, attempt_count, last_error"],
      },
      { type: "eq", args: ["user_id", "owner-1"] },
      { type: "not", args: ["soft_deleted_at", "is", null] },
      { type: "maybeSingle", args: [] },
    ]);
  });

  it("upserts deletion requests with explicit retention timestamps", async () => {
    const { builder, client } = createMockClient({ data: requestedOnlyRow, error: null });

    const result = await upsertAccountDeletionRequest(client, {
      userId: "owner-1",
      requestedAt: "2026-06-11T10:00:00.000Z",
      purgeAfter: "2026-07-11T10:00:00.000Z",
    });

    expect(result).toEqual(mapAccountDeletionRequestRow(requestedOnlyRow));
    expect(builder.actions).toEqual([
      { type: "from", args: ["account_deletion_requests"] },
      {
        type: "upsert",
        args: [
          {
            user_id: "owner-1",
            requested_at: "2026-06-11T10:00:00.000Z",
            purge_after: "2026-07-11T10:00:00.000Z",
            soft_deleted_at: null,
            last_attempt_at: null,
            attempt_count: 0,
            last_error: null,
          },
          { onConflict: "user_id" },
        ],
      },
      {
        type: "select",
        args: ["user_id, requested_at, purge_after, soft_deleted_at, last_attempt_at, attempt_count, last_error"],
      },
      { type: "single", args: [] },
    ]);
  });

  it("marks requests as soft-deleted after auth admin success", async () => {
    const { builder, client } = createMockClient({ data: dbRow, error: null });

    const result = await markAccountDeletionRequestSoftDeleted(client, {
      userId: "owner-1",
      softDeletedAt: "2026-06-11T10:05:00.000Z",
      lastAttemptAt: "2026-06-11T10:05:00.000Z",
      attemptCount: 1,
    });

    expect(result).toEqual(mapAccountDeletionRequestRow(dbRow));
    expect(builder.actions).toEqual([
      { type: "from", args: ["account_deletion_requests"] },
      {
        type: "update",
        args: [
          {
            soft_deleted_at: "2026-06-11T10:05:00.000Z",
            last_attempt_at: "2026-06-11T10:05:00.000Z",
            attempt_count: 1,
            last_error: null,
          },
        ],
      },
      { type: "eq", args: ["user_id", "owner-1"] },
      {
        type: "select",
        args: ["user_id, requested_at, purge_after, soft_deleted_at, last_attempt_at, attempt_count, last_error"],
      },
      { type: "single", args: [] },
    ]);
  });

  it("lists due purge candidates by purge_after <= now ordered by deadline", async () => {
    const { builder, client } = createMockClient({ data: [dbRow], error: null });

    const result = await listDueAccountDeletionRequests(client, "2026-07-12T10:00:00.000Z");

    expect(result).toEqual([mapAccountDeletionRequestRow(dbRow)]);
    expect(builder.actions).toEqual([
      { type: "from", args: ["account_deletion_requests"] },
      {
        type: "select",
        args: ["user_id, requested_at, purge_after, soft_deleted_at, last_attempt_at, attempt_count, last_error"],
      },
      { type: "lte", args: ["purge_after", "2026-07-12T10:00:00.000Z"] },
      { type: "not", args: ["soft_deleted_at", "is", null] },
      { type: "order", args: ["purge_after", { ascending: true }] },
    ]);
  });

  it("updates failure metadata by user_id", async () => {
    const { builder, client } = createMockClient({
      data: {
        ...dbRow,
        last_attempt_at: "2026-07-12T11:00:00.000Z",
        attempt_count: 2,
        last_error: "delete failed",
      },
      error: null,
    });

    const result = await updateAccountDeletionAttempt(client, {
      userId: "owner-1",
      lastAttemptAt: "2026-07-12T11:00:00.000Z",
      attemptCount: 2,
      lastError: "delete failed",
    });

    expect(result).toEqual({
      ...mapAccountDeletionRequestRow(dbRow),
      lastAttemptAt: "2026-07-12T11:00:00.000Z",
      attemptCount: 2,
      lastError: "delete failed",
    });
    expect(builder.actions).toEqual([
      { type: "from", args: ["account_deletion_requests"] },
      {
        type: "update",
        args: [
          {
            last_attempt_at: "2026-07-12T11:00:00.000Z",
            attempt_count: 2,
            last_error: "delete failed",
          },
        ],
      },
      { type: "eq", args: ["user_id", "owner-1"] },
      {
        type: "select",
        args: ["user_id, requested_at, purge_after, soft_deleted_at, last_attempt_at, attempt_count, last_error"],
      },
      { type: "single", args: [] },
    ]);
  });
});
