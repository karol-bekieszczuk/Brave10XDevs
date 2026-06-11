import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const requestAccountDeletionMock = vi.fn();

vi.mock("cloudflare:workers", () => ({
  env: {},
}));

vi.mock("astro:env/server", () => ({
  AUTHORIZED_USER_ID: "owner-1",
  OPENROUTER_API_KEY: "openrouter-key",
  SUPABASE_ADMIN_KEY: undefined,
  SUPABASE_KEY: "anon-key",
  SUPABASE_URL: "https://example.supabase.co",
}));

vi.mock("@/lib/supabase", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/supabase-admin", () => ({
  createAdminClient: createAdminClientMock,
}));

vi.mock("@/lib/account-deletion/service", () => ({
  requestAccountDeletion: requestAccountDeletionMock,
}));

const { POST } = await import("./delete");

function createContext(user: { id: string } | null = { id: "owner-1" }) {
  return {
    request: new Request("http://localhost/api/account/delete", { method: "POST" }),
    cookies: {},
    locals: { user },
    redirect: vi.fn((location: string) => new Response(null, { status: 302, headers: { location } })),
  };
}

describe("account deletion API route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createAdminClientMock.mockReturnValue({});
    createClientMock.mockReturnValue({
      auth: {
        signOut: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("redirects to the dashboard when the user is not authenticated", async () => {
    const context = createContext(null);

    const response = await POST(context as never);

    expect(response.headers.get("location")).toBe("/dashboard?error=Unable%20to%20request%20account%20deletion");
    expect(requestAccountDeletionMock).not.toHaveBeenCalled();
  });

  it("redirects to the dashboard when account deletion is not configured", async () => {
    requestAccountDeletionMock.mockResolvedValue({ status: "missing_admin_config" });
    const context = createContext();

    const response = await POST(context as never);

    expect(response.headers.get("location")).toBe("/dashboard?error=Account%20deletion%20is%20not%20configured");
  });

  it("signs out only after successful deletion and redirects to sign-in", async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);
    createClientMock.mockReturnValue({ auth: { signOut } });
    requestAccountDeletionMock.mockResolvedValue({
      status: "success",
      request: { userId: "owner-1" },
    });
    const context = createContext();

    const response = await POST(context as never);

    expect(requestAccountDeletionMock).toHaveBeenCalledWith("owner-1", { adminClient: {} });
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(response.headers.get("location")).toBe("/auth/signin?message=Account%20deletion%20requested");
  });

  it("does not sign out when the service fails", async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);
    createClientMock.mockReturnValue({ auth: { signOut } });
    requestAccountDeletionMock.mockResolvedValue({
      status: "unexpected_failure",
      request: null,
      error: "delete failed",
    });
    const context = createContext();

    const response = await POST(context as never);

    expect(signOut).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("/dashboard?error=Unable%20to%20request%20account%20deletion");
  });
});
