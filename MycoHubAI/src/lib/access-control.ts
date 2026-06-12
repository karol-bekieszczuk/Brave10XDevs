import type { User } from "@supabase/supabase-js";
import { getAuthorizedUserId } from "@/lib/runtime-env";

export const ACCESS_DENIED_ERROR = "Access denied";
export const ACCESS_CONFIG_ERROR = "Authorized user is not configured";
export const ACCOUNT_DELETION_PENDING_MESSAGE = "Account deletion is pending";
export const ACCOUNT_DELETION_REQUESTED_MESSAGE = "Account deletion requested";
export const ACCOUNT_DELETION_CONFIG_ERROR = "Account deletion is not configured";
export const ACCOUNT_DELETION_REQUEST_ERROR = "Unable to request account deletion";

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
