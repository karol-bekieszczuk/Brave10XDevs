import type { User } from "@supabase/supabase-js";
import { getAuthorizedUserId } from "@/lib/runtime-env";

export const ACCESS_DENIED_ERROR = "Access denied";
export const ACCESS_CONFIG_ERROR = "Authorized user is not configured";

export function getAccessControlConfig(): { authorizedUserId: string; isConfigured: boolean } {
  const authorizedUserId = getAuthorizedUserId()?.trim() ?? "";

  return {
    authorizedUserId,
    isConfigured: Boolean(authorizedUserId),
  };
}

export function isAuthorizedUser(user: User | null | undefined) {
  const { authorizedUserId } = getAccessControlConfig();

  return Boolean(user?.id && authorizedUserId && user.id === authorizedUserId);
}
