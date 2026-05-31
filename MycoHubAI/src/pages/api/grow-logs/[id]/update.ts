import type { APIRoute } from "astro";
import { updateGrowLog } from "@/lib/grow-logs/repository";
import { validateGrowLogInput } from "@/lib/grow-logs/validation";
import { createClient } from "@/lib/supabase";

function getFailureRedirect(id: string, form: FormData, message: string) {
  const params = new URLSearchParams({
    error: message,
  });

  const stage = form.get("stage");

  if (typeof stage === "string") {
    params.set("stage", stage);
  }

  return `/grow-logs/${id}/edit?${params.toString()}`;
}

export const POST: APIRoute = async (context) => {
  const id = context.params.id ?? "";
  let form: FormData | null = null;

  try {
    const user = context.locals.user;
    const supabase = createClient(context.request.headers, context.cookies);

    if (!user || !supabase) {
      return context.redirect("/auth/signin?error=Unable to update grow log");
    }

    form = await context.request.formData();
    const validation = validateGrowLogInput({
      stage: form.get("stage"),
      title: form.get("title"),
      body: form.get("body"),
    });

    if (!validation.success) {
      return context.redirect(getFailureRedirect(id, form, validation.errors[0]?.message ?? "Invalid grow log input"));
    }

    const updated = await updateGrowLog(supabase, id, user.id, validation.data);

    if (!updated) {
      return context.redirect("/grow-logs?error=Grow log not found");
    }

    return context.redirect(`/grow-logs/${updated.id}`);
  } catch {
    return context.redirect(
      form
        ? getFailureRedirect(id, form, "Unable to update grow log")
        : `/grow-logs/${id}/edit?error=Unable to update grow log`,
    );
  }
};
