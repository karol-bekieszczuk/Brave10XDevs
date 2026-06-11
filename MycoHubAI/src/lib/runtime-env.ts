import { env } from "cloudflare:workers";
import {
  AUTHORIZED_USER_ID as ASTRO_AUTHORIZED_USER_ID,
  OPENROUTER_API_KEY as ASTRO_OPENROUTER_API_KEY,
  SUPABASE_KEY as ASTRO_SUPABASE_KEY,
  SUPABASE_URL as ASTRO_SUPABASE_URL,
} from "astro:env/server";

const cloudflareEnv = env as Record<string, string | undefined>;

export function getSupabaseEnv() {
  return {
    url: cloudflareEnv.SUPABASE_URL ?? ASTRO_SUPABASE_URL,
    key: cloudflareEnv.SUPABASE_KEY ?? ASTRO_SUPABASE_KEY,
  };
}

export function getAuthorizedUserId() {
  return cloudflareEnv.AUTHORIZED_USER_ID ?? ASTRO_AUTHORIZED_USER_ID;
}

export function getOpenRouterApiKey() {
  return cloudflareEnv.OPENROUTER_API_KEY ?? ASTRO_OPENROUTER_API_KEY;
}
