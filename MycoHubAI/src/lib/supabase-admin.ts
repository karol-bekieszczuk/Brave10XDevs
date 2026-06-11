import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdminKey, getSupabaseEnv } from "@/lib/runtime-env";

export function getSupabaseAdminConfig() {
  const { url } = getSupabaseEnv();
  const trimmedUrl = url.trim();
  const adminKey = getSupabaseAdminKey()?.trim() ?? "";

  return {
    url: trimmedUrl,
    adminKey,
    isConfigured: Boolean(trimmedUrl && adminKey),
  };
}

export function createAdminClient() {
  const { url, adminKey, isConfigured } = getSupabaseAdminConfig();

  if (!isConfigured) {
    return null;
  }

  return createClient(url, adminKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
