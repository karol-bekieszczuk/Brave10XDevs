import { defineMiddleware } from "astro:middleware";
import {
  ACCESS_CONFIG_ERROR,
  ACCESS_DENIED_ERROR,
  ACCOUNT_DELETION_PENDING_MESSAGE,
  getAccessControlConfig,
  isAuthorizedUser,
} from "@/lib/access-control";
import { getOwnerAccountDeletionRequest } from "@/lib/account-deletion/repository";
import { safeSignOut } from "@/lib/auth-session";
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
  context.locals.user = null;

  if (isPublicRoute(context.url.pathname, context.request.method)) {
    return next();
  }

  if (supabase) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      context.locals.user = user ?? null;
    } catch {
      context.locals.user = null;
    }
  }

  const accessConfig = getAccessControlConfig();
  if (!accessConfig.isConfigured) {
    await safeSignOut(supabase, context.request.headers, context.cookies);
    return context.redirect(`/auth/signin?error=${encodeURIComponent(ACCESS_CONFIG_ERROR)}`);
  }

  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  if (!isAuthorizedUser(context.locals.user)) {
    await safeSignOut(supabase, context.request.headers, context.cookies);
    return context.redirect(`/auth/signin?error=${encodeURIComponent(ACCESS_DENIED_ERROR)}`);
  }

  const pendingDeletion = await getOwnerAccountDeletionRequest(supabase, context.locals.user.id);
  if (pendingDeletion) {
    await safeSignOut(supabase, context.request.headers, context.cookies);
    return context.redirect(`/auth/signin?message=${encodeURIComponent(ACCOUNT_DELETION_PENDING_MESSAGE)}`);
  }

  return next();
});
