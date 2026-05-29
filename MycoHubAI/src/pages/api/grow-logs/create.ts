import type { APIRoute } from "astro";
import { createGrowLog } from "@/lib/grow-logs/repository";
import { validateGrowLogInput } from "@/lib/grow-logs/validation";
import { createClient } from "@/lib/supabase";

function getFailureRedirect(form: FormData, message: string) {
  const params = new URLSearchParams({
    error: message,
  });

  const stage = form.get("stage");
  const title = form.get("title");
  const body = form.get("body");

  if (typeof stage === "string") {
    params.set("stage", stage);
  }

  if (typeof title === "string") {
    params.set("title", title);
  }

  if (typeof body === "string") {
    params.set("body", body);
  }

  return `/grow-logs/new?${params.toString()}`;
}

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  const supabase = createClient(context.request.headers, context.cookies);

  if (!user || !supabase) {
    return context.redirect("/auth/signin?error=Unable to create grow log");
  }

  const form = await context.request.formData();
  const validation = validateGrowLogInput({
    stage: form.get("stage"),
    title: form.get("title"),
    body: form.get("body"),
  });

  if (!validation.success) {
    return context.redirect(getFailureRedirect(form, validation.errors[0]?.message ?? "Invalid grow log input"));
  }

  const log = await createGrowLog(supabase, user.id, validation.data);
  return context.redirect(`/grow-logs/${log.id}`);
};
