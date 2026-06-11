import { describe, expect, it } from "vitest";
import type { GrowLogClient, GrowLogRecord } from "./repository";
import {
  createGrowLog,
  deleteGrowLog,
  deleteOwnerGrowLogs,
  getOwnerGrowLog,
  listOwnerGrowLogs,
  mapGrowLogRow,
  updateGrowLog,
} from "./repository";
import type { SupabaseServerClient } from "@/lib/supabase";

interface QueryResult {
  data: GrowLogRecord | GrowLogRecord[] | null;
  error: null;
}

class MockQueryBuilder {
  readonly actions: { type: string; args: unknown[] }[] = [];

  constructor(private readonly result: QueryResult) {}

  select(...args: unknown[]) {
    this.actions.push({ type: "select", args });
    return this;
  }

  insert(...args: unknown[]) {
    this.actions.push({ type: "insert", args });
    return this;
  }

  update(...args: unknown[]) {
    this.actions.push({ type: "update", args });
    return this;
  }

  delete(...args: unknown[]) {
    this.actions.push({ type: "delete", args });
    return this;
  }

  eq(...args: unknown[]) {
    this.actions.push({ type: "eq", args });
    return this;
  }

  in(...args: unknown[]) {
    this.actions.push({ type: "in", args });
    return this;
  }

  order(...args: unknown[]) {
    this.actions.push({ type: "order", args });
    return this;
  }

  single() {
    this.actions.push({ type: "single", args: [] });
    return this;
  }

  maybeSingle() {
    this.actions.push({ type: "maybeSingle", args: [] });
    return this;
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    _onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve(this.result).then(onfulfilled);
  }
}

function createMockClient(result: QueryResult): { builder: MockQueryBuilder; client: GrowLogClient } {
  const builder = new MockQueryBuilder(result);

  const client: SupabaseServerClient = {
    auth: {
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
      signInWithPassword: () => Promise.resolve({ data: { user: null }, error: null }),
      signOut: () => Promise.resolve({ error: null }),
    },
    from(table: string) {
      builder.actions.push({ type: "from", args: [table] });
      return builder;
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
  };

  return { builder, client };
}

const dbRow: GrowLogRecord = {
  id: "log-1",
  owner_id: "owner-1",
  stage: "agar",
  title: "Plate A",
  body: "Healthy leading edge",
  created_at: "2026-05-29T10:00:00.000Z",
  updated_at: "2026-05-29T11:00:00.000Z",
};

describe("grow-log repository", () => {
  it("maps database rows into the app shape", () => {
    expect(mapGrowLogRow(dbRow)).toEqual({
      id: "log-1",
      ownerId: "owner-1",
      stage: "agar",
      title: "Plate A",
      body: "Healthy leading edge",
      createdAt: "2026-05-29T10:00:00.000Z",
      updatedAt: "2026-05-29T11:00:00.000Z",
    });
  });

  it("lists only the owner's rows and orders by recency", async () => {
    const { builder, client } = createMockClient({ data: [dbRow], error: null });

    const result = await listOwnerGrowLogs(client, "owner-1");

    expect(result).toEqual([mapGrowLogRow(dbRow)]);
    expect(builder.actions).toEqual([
      { type: "from", args: ["grow_logs"] },
      { type: "select", args: ["id, owner_id, stage, title, body, created_at, updated_at"] },
      { type: "eq", args: ["owner_id", "owner-1"] },
      { type: "order", args: ["updated_at", { ascending: false }] },
      { type: "order", args: ["created_at", { ascending: false }] },
    ]);
  });

  it("filters fetches by log id and owner id", async () => {
    const { builder, client } = createMockClient({ data: dbRow, error: null });

    const result = await getOwnerGrowLog(client, "log-1", "owner-1");

    expect(result).toEqual(mapGrowLogRow(dbRow));
    expect(builder.actions).toEqual([
      { type: "from", args: ["grow_logs"] },
      { type: "select", args: ["id, owner_id, stage, title, body, created_at, updated_at"] },
      { type: "eq", args: ["id", "log-1"] },
      { type: "eq", args: ["owner_id", "owner-1"] },
      { type: "maybeSingle", args: [] },
    ]);
  });

  it("sets owner_id from the authenticated user on insert", async () => {
    const { builder, client } = createMockClient({ data: dbRow, error: null });

    const result = await createGrowLog(client, "owner-1", {
      stage: "agar",
      title: "Plate A",
      body: "Healthy leading edge",
    });

    expect(result).toEqual(mapGrowLogRow(dbRow));
    expect(builder.actions).toEqual([
      { type: "from", args: ["grow_logs"] },
      {
        type: "insert",
        args: [
          {
            owner_id: "owner-1",
            stage: "agar",
            title: "Plate A",
            body: "Healthy leading edge",
          },
        ],
      },
      { type: "select", args: ["id, owner_id, stage, title, body, created_at, updated_at"] },
      { type: "single", args: [] },
    ]);
  });

  it("filters updates by both id and owner_id", async () => {
    const { builder, client } = createMockClient({ data: dbRow, error: null });

    const result = await updateGrowLog(client, "log-1", "owner-1", {
      stage: "grain",
      title: "Jar A",
      body: "Shaken once",
    });

    expect(result).toEqual(mapGrowLogRow(dbRow));
    expect(builder.actions).toEqual([
      { type: "from", args: ["grow_logs"] },
      {
        type: "update",
        args: [
          {
            stage: "grain",
            title: "Jar A",
            body: "Shaken once",
          },
        ],
      },
      { type: "eq", args: ["id", "log-1"] },
      { type: "eq", args: ["owner_id", "owner-1"] },
      { type: "select", args: ["id, owner_id, stage, title, body, created_at, updated_at"] },
      { type: "maybeSingle", args: [] },
    ]);
  });

  it("filters deletes by both id and owner_id", async () => {
    const { builder, client } = createMockClient({ data: null, error: null });

    await deleteGrowLog(client, "log-1", "owner-1");

    expect(builder.actions).toEqual([
      { type: "from", args: ["grow_logs"] },
      { type: "delete", args: [] },
      { type: "eq", args: ["id", "log-1"] },
      { type: "eq", args: ["owner_id", "owner-1"] },
    ]);
  });

  it("filters bulk deletes by both owner_id and selected ids", async () => {
    const { builder, client } = createMockClient({ data: null, error: null });
    const ids = ["550e8400-e29b-41d4-a716-446655440000", "550e8400-e29b-41d4-a716-446655440001"];

    await deleteOwnerGrowLogs(client, ids, "owner-1");

    expect(builder.actions).toEqual([
      { type: "from", args: ["grow_logs"] },
      { type: "delete", args: [] },
      { type: "eq", args: ["owner_id", "owner-1"] },
      { type: "in", args: ["id", ids] },
    ]);
  });
});
