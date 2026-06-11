import type { CreateGrowLogInput, GrowLogRow, UpdateGrowLogInput } from "@/lib/grow-logs/types";
import type { SupabaseServerClient, SupabaseTableClientLike } from "@/lib/supabase";

const GROW_LOG_SELECT = "id, owner_id, stage, title, body, created_at, updated_at";

export type GrowLogClient = Pick<SupabaseServerClient, "from">;

export interface GrowLogRecord {
  id: string;
  owner_id: string;
  stage: GrowLogRow["stage"];
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
}

interface GrowLogListQuery extends PromiseLike<{ data: GrowLogRecord[] | null; error: Error | null }> {
  eq(column: "owner_id", value: string): GrowLogListQuery;
  order(column: "updated_at" | "created_at", options: { ascending: false }): GrowLogListQuery;
}

interface GrowLogSingleQuery extends PromiseLike<{ data: GrowLogRecord | null; error: Error | null }> {
  eq(column: "id" | "owner_id", value: string): GrowLogSingleQuery;
  maybeSingle(): GrowLogSingleQuery;
}

interface GrowLogInsertQuery extends PromiseLike<{ data: GrowLogRecord; error: Error | null }> {
  select(query: string): GrowLogInsertQuery;
  single(): GrowLogInsertQuery;
}

interface GrowLogUpdateQuery extends PromiseLike<{ data: GrowLogRecord | null; error: Error | null }> {
  eq(column: "id" | "owner_id", value: string): GrowLogUpdateQuery;
  select(query: string): GrowLogUpdateQuery;
  maybeSingle(): GrowLogUpdateQuery;
}

interface GrowLogDeleteByIdQuery extends PromiseLike<{ error: Error | null }> {
  eq(column: "id" | "owner_id", value: string): GrowLogDeleteByIdQuery;
}

interface GrowLogDeleteByOwnerQuery extends PromiseLike<{ error: Error | null }> {
  eq(
    column: "owner_id",
    value: string,
  ): {
    in(column: "id", values: string[]): GrowLogDeleteByOwnerQuery;
  };
}

interface GrowLogTable extends SupabaseTableClientLike {
  select(query: string): GrowLogListQuery;
  insert(values: { owner_id: string; stage: GrowLogRow["stage"]; title: string; body: string }): GrowLogInsertQuery;
  update(values: UpdateGrowLogInput): GrowLogUpdateQuery;
  delete(): {
    eq(
      column: "id",
      value: string,
    ): {
      eq(column: "owner_id", value: string): GrowLogDeleteByIdQuery;
    };
    eq(
      column: "owner_id",
      value: string,
    ): {
      in(column: "id", values: string[]): GrowLogDeleteByOwnerQuery;
    };
  };
}

function getGrowLogTable(client: GrowLogClient): GrowLogTable {
  return client.from("grow_logs") as GrowLogTable;
}

export function mapGrowLogRow(record: GrowLogRecord): GrowLogRow {
  return {
    id: record.id,
    ownerId: record.owner_id,
    stage: record.stage,
    title: record.title,
    body: record.body,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

export async function listOwnerGrowLogs(client: GrowLogClient, ownerId: string) {
  const { data, error } = await getGrowLogTable(client)
    .select(GROW_LOG_SELECT)
    .eq("owner_id", ownerId)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapGrowLogRow);
}

export async function getOwnerGrowLog(client: GrowLogClient, id: string, ownerId: string) {
  const { data, error } = await (getGrowLogTable(client).select(GROW_LOG_SELECT) as unknown as GrowLogSingleQuery)
    .eq("id", id)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapGrowLogRow(data) : null;
}

export async function createGrowLog(client: GrowLogClient, ownerId: string, input: CreateGrowLogInput) {
  const { data, error } = await getGrowLogTable(client)
    .insert({
      owner_id: ownerId,
      stage: input.stage,
      title: input.title,
      body: input.body,
    })
    .select(GROW_LOG_SELECT)
    .single();

  if (error) {
    throw error;
  }

  return mapGrowLogRow(data);
}

export async function updateGrowLog(client: GrowLogClient, id: string, ownerId: string, input: UpdateGrowLogInput) {
  const { data, error } = await getGrowLogTable(client)
    .update(input)
    .eq("id", id)
    .eq("owner_id", ownerId)
    .select(GROW_LOG_SELECT)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapGrowLogRow(data) : null;
}

export async function deleteGrowLog(client: GrowLogClient, id: string, ownerId: string) {
  const { error } = await getGrowLogTable(client).delete().eq("id", id).eq("owner_id", ownerId);

  if (error) {
    throw error;
  }
}

export async function deleteOwnerGrowLogs(client: GrowLogClient, ids: string[], ownerId: string) {
  if (ids.length === 0) {
    throw new Error("deleteOwnerGrowLogs requires at least one grow log id.");
  }

  const { error } = await getGrowLogTable(client).delete().eq("owner_id", ownerId).in("id", ids);

  if (error) {
    throw error;
  }
}
