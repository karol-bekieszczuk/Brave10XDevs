import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import type { AstroCookies } from "astro";
import type { DiagnosisRetrievalClient } from "@/lib/diagnosis/retrieval";
import { getSupabaseEnv } from "@/lib/runtime-env";
import type { User } from "@supabase/supabase-js";

interface SupabaseAuthResult {
  user: User | null;
}

interface SupabaseAuthClient {
  getUser(): Promise<{ data: SupabaseAuthResult; error: Error | null }>;
  signInWithPassword(credentials: { email: string; password: string }): Promise<{
    data: SupabaseAuthResult;
    error: Error | null;
  }>;
  signOut(): Promise<{ error: Error | null }>;
}

export interface SupabaseTableClientLike {
  select(query: string): unknown;
  insert(values: Record<string, unknown>): unknown;
  update(values: Record<string, unknown>): unknown;
  delete(): unknown;
}

export interface SupabaseServerClient extends DiagnosisRetrievalClient {
  auth: SupabaseAuthClient;
  from(table: string): SupabaseTableClientLike;
}

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
  }) as unknown as SupabaseServerClient;
}
