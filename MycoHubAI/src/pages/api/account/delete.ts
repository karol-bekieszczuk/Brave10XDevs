import type { APIRoute } from "astro";
import {
  ACCOUNT_DELETION_CONFIG_ERROR,
  ACCOUNT_DELETION_REQUESTED_MESSAGE,
  ACCOUNT_DELETION_REQUEST_ERROR,
} from "@/lib/access-control";
import { requestAccountDeletion } from "@/lib/account-deletion/service";
import { safeSignOut } from "@/lib/auth-session";
import { createAdminClient } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase";

function redirectToDashboard(context: Parameters<APIRoute>[0], errorMessage: string) {
  return context.redirect(`/dashboard?error=${encodeURIComponent(errorMessage)}`);
}

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  const supabase = createClient(context.request.headers, context.cookies);

  if (!user || !supabase) {
    return redirectToDashboard(context, ACCOUNT_DELETION_REQUEST_ERROR);
  }

  const result = await requestAccountDeletion(user.id, {
    adminClient: createAdminClient(),
  });

  if (result.status === "missing_admin_config") {
    return redirectToDashboard(context, ACCOUNT_DELETION_CONFIG_ERROR);
  }

  if (result.status === "unexpected_failure") {
    return redirectToDashboard(context, ACCOUNT_DELETION_REQUEST_ERROR);
  }

  await safeSignOut(supabase, context.request.headers, context.cookies);
  return context.redirect(`/auth/signin?message=${encodeURIComponent(ACCOUNT_DELETION_REQUESTED_MESSAGE)}`);
};
