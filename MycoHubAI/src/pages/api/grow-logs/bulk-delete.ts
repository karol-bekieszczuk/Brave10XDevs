import type { APIRoute } from "astro";
import { deleteOwnerGrowLogs } from "@/lib/grow-logs/repository";
import { BULK_DELETE_SELECTED_IDS_FIELD, validateBulkSelectedGrowLogIds } from "@/lib/grow-logs/validation";
import { createClient } from "@/lib/supabase";

const SELECT_AT_LEAST_ONE_ERROR = "Select at least one grow log";
const BULK_DELETE_FAILURE_ERROR = "Unable to delete selected grow logs";
const BULK_DELETE_SUCCESS_MESSAGE = "Selected grow logs deleted.";

export const POST: APIRoute = async (context) => {
  try {
    const user = context.locals.user;
    const supabase = createClient(context.request.headers, context.cookies);

    if (!user || !supabase) {
      return context.redirect(`/auth/signin?error=${encodeURIComponent(BULK_DELETE_FAILURE_ERROR)}`);
    }

    const form = await context.request.formData();
    const selectedIds = validateBulkSelectedGrowLogIds(form.getAll(BULK_DELETE_SELECTED_IDS_FIELD));

    if (!selectedIds.success) {
      return context.redirect(`/grow-logs?error=${encodeURIComponent(SELECT_AT_LEAST_ONE_ERROR)}`);
    }

    await deleteOwnerGrowLogs(supabase, selectedIds.data, user.id);
    return context.redirect(`/grow-logs?message=${encodeURIComponent(BULK_DELETE_SUCCESS_MESSAGE)}`);
  } catch {
    return context.redirect(`/grow-logs?error=${encodeURIComponent(BULK_DELETE_FAILURE_ERROR)}`);
  }
};
