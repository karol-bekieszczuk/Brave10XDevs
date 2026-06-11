import type { APIRoute } from "astro";
import {
  ACCESS_CONFIG_ERROR,
  ACCESS_DENIED_ERROR,
  getAccessControlConfig,
  isAuthorizedUser,
} from "@/lib/access-control";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = form.get("email") as string;
  const password = form.get("password") as string;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  const accessConfig = getAccessControlConfig();
  if (!accessConfig.isConfigured) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent(ACCESS_CONFIG_ERROR)}`);
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent(error.message)}`);
  }

  if (!isAuthorizedUser(data.user)) {
    await supabase.auth.signOut();
    return context.redirect(`/auth/signin?error=${encodeURIComponent(ACCESS_DENIED_ERROR)}`);
  }

  return context.redirect("/");
};
