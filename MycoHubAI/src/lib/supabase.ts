import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import type { AstroCookies } from "astro";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/runtime-env";

export type SupabaseServerClient = SupabaseClient;

export function createClient(requestHeaders: Headers, cookies: AstroCookies): SupabaseServerClient | null {
  const { url, key } = getSupabaseEnv();

  if (!url || !key) {
    return null;
  }
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return parseCookieHeader(requestHeaders.get("Cookie") ?? "").map(({ name, value }) => ({
          name,
          value: value ?? "",
        }));
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookies.set(name, value, options);
        });
      },
    },
  });
}
