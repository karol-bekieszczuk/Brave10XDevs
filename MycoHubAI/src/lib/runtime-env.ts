import { env } from "cloudflare:workers";
import {
  AUTHORIZED_USER_ID as ASTRO_AUTHORIZED_USER_ID,
  OPENROUTER_API_KEY as ASTRO_OPENROUTER_API_KEY,
  SUPABASE_ADMIN_KEY as ASTRO_SUPABASE_ADMIN_KEY,
  SUPABASE_KEY as ASTRO_SUPABASE_KEY,
  SUPABASE_URL as ASTRO_SUPABASE_URL,
} from "astro:env/server";

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function getSupabaseEnv(): { url?: string; key?: string } {
  return {
    url: readOptionalString(env.SUPABASE_URL) ?? readOptionalString(ASTRO_SUPABASE_URL),
    key: readOptionalString(env.SUPABASE_KEY) ?? readOptionalString(ASTRO_SUPABASE_KEY),
  };
}

export function getAuthorizedUserId(): string | undefined {
  return readOptionalString(env.AUTHORIZED_USER_ID) ?? readOptionalString(ASTRO_AUTHORIZED_USER_ID);
}

export function getOpenRouterApiKey(): string | undefined {
  return readOptionalString(env.OPENROUTER_API_KEY) ?? readOptionalString(ASTRO_OPENROUTER_API_KEY);
}

export function getSupabaseAdminKey(): string | undefined {
  return readOptionalString(env.SUPABASE_ADMIN_KEY) ?? readOptionalString(ASTRO_SUPABASE_ADMIN_KEY);
}
