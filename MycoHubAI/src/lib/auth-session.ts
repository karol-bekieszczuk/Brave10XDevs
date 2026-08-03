import { parseCookieHeader } from "@supabase/ssr";
import type { AstroCookies } from "astro";
import type { SupabaseClient } from "@supabase/supabase-js";

type SignOutClient = Pick<SupabaseClient, "auth">;

function clearSupabaseAuthCookies(requestHeaders: Headers, cookies: AstroCookies) {
  const parsedCookies = parseCookieHeader(requestHeaders.get("Cookie") ?? "");

  for (const { name } of parsedCookies) {
    if (!name.startsWith("sb-")) {
      continue;
    }

    cookies.set(name, "", {
      path: "/",
      maxAge: 0,
    });
  }
}

export async function safeSignOut(supabase: SignOutClient | null, requestHeaders: Headers, cookies: AstroCookies) {
  if (supabase) {
    try {
      await supabase.auth.signOut();
    } catch {
      // Soft-deleted users can leave behind an unreadable auth cookie; clear it locally.
    }
  }

  clearSupabaseAuthCookies(requestHeaders, cookies);
}
