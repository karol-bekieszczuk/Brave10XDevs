import type { CreateGrowLogInput, GrowLogRow, UpdateGrowLogInput } from "@/lib/grow-logs/types";
import type { createClient } from "@/lib/supabase";

const GROW_LOG_SELECT = "id, owner_id, stage, title, body, created_at, updated_at";

export type GrowLogClient = NonNullable<ReturnType<typeof createClient>>;

export interface GrowLogRecord {
  id: string;
  owner_id: string;
  stage: GrowLogRow["stage"];
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
}

function getGrowLogTable(client: GrowLogClient) {
  return client.from("grow_logs");
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

  return (data satisfies GrowLogRecord[]).map(mapGrowLogRow);
}

export async function getOwnerGrowLog(client: GrowLogClient, id: string, ownerId: string) {
  const { data, error } = await getGrowLogTable(client)
    .select(GROW_LOG_SELECT)
    .eq("id", id)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapGrowLogRow(data satisfies GrowLogRecord) : null;
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

  return mapGrowLogRow(data satisfies GrowLogRecord);
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

  return data ? mapGrowLogRow(data satisfies GrowLogRecord) : null;
}

export async function deleteGrowLog(client: GrowLogClient, id: string, ownerId: string) {
  const { error } = await getGrowLogTable(client).delete().eq("id", id).eq("owner_id", ownerId);

  if (error) {
    throw error;
  }
}
