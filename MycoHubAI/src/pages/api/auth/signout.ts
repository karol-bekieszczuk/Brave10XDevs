import type { APIRoute } from "astro";
import { safeSignOut } from "@/lib/auth-session";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  await safeSignOut(supabase, context.request.headers, context.cookies);
  return context.redirect("/");
};
