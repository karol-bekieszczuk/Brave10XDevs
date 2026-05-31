import type { APIRoute } from "astro";
import { deleteGrowLog, getOwnerGrowLog } from "@/lib/grow-logs/repository";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const id = context.params.id ?? "";

  try {
    const user = context.locals.user;
    const supabase = createClient(context.request.headers, context.cookies);

    if (!user || !supabase) {
      return context.redirect("/auth/signin?error=Unable to delete grow log");
    }

    const existing = await getOwnerGrowLog(supabase, id, user.id);

    if (!existing) {
      return context.redirect("/grow-logs?error=Grow log not found");
    }

    await deleteGrowLog(supabase, id, user.id);
    return context.redirect("/grow-logs");
  } catch {
    return context.redirect(`/grow-logs/${id}?error=Unable to delete grow log`);
  }
};
