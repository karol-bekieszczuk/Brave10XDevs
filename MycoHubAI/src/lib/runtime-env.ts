import { env } from "cloudflare:workers";
import { SUPABASE_KEY as ASTRO_SUPABASE_KEY, SUPABASE_URL as ASTRO_SUPABASE_URL } from "astro:env/server";

const cloudflareEnv = env as Record<string, string | undefined>;

export function getSupabaseEnv() {
  return {
    url: cloudflareEnv.SUPABASE_URL ?? ASTRO_SUPABASE_URL,
    key: cloudflareEnv.SUPABASE_KEY ?? ASTRO_SUPABASE_KEY,
  };
}
