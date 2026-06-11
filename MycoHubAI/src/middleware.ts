import { defineMiddleware } from "astro:middleware";
import {
  ACCESS_CONFIG_ERROR,
  ACCESS_DENIED_ERROR,
  ACCOUNT_DELETION_PENDING_MESSAGE,
  ACCOUNT_DELETION_CONFIG_ERROR,
  getAccessControlConfig,
  isAuthorizedUser,
} from "@/lib/access-control";
import { getAccountDeletionRequestByUserId } from "@/lib/account-deletion/repository";
import { createAdminClient } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase";

const PUBLIC_ASSET_PATHS = ["/favicon.png", "/template.png"];

function isPublicRoute(pathname: string, method: string) {
  if (pathname === "/auth/signin") {
    return true;
  }

  if (method === "POST" && ["/api/auth/signin", "/api/auth/signout"].includes(pathname)) {
    return true;
  }

  return pathname.startsWith("/_astro/") || PUBLIC_ASSET_PATHS.includes(pathname);
}

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;
  } else {
    context.locals.user = null;
  }

  if (isPublicRoute(context.url.pathname, context.request.method)) {
    return next();
  }

  const accessConfig = getAccessControlConfig();
  if (!accessConfig.isConfigured) {
    if (supabase) {
      await supabase.auth.signOut();
    }
    return context.redirect(`/auth/signin?error=${encodeURIComponent(ACCESS_CONFIG_ERROR)}`);
  }

  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  if (!isAuthorizedUser(context.locals.user)) {
    if (supabase) {
      await supabase.auth.signOut();
    }
    return context.redirect(`/auth/signin?error=${encodeURIComponent(ACCESS_DENIED_ERROR)}`);
  }

  const adminClient = createAdminClient();
  if (!adminClient) {
    await supabase.auth.signOut();
    return context.redirect(`/auth/signin?error=${encodeURIComponent(ACCOUNT_DELETION_CONFIG_ERROR)}`);
  }

  const pendingDeletion = await getAccountDeletionRequestByUserId(adminClient, context.locals.user.id);
  if (pendingDeletion?.softDeletedAt) {
    await supabase.auth.signOut();
    return context.redirect(`/auth/signin?message=${encodeURIComponent(ACCOUNT_DELETION_PENDING_MESSAGE)}`);
  }

  return next();
});
