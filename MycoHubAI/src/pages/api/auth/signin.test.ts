import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const getOwnerAccountDeletionRequestMock = vi.fn();

vi.mock("@/lib/supabase", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/account-deletion/repository", () => ({
  getOwnerAccountDeletionRequest: getOwnerAccountDeletionRequestMock,
}));

vi.mock("@/lib/runtime-env", () => ({
  getAuthorizedUserId: vi.fn(() => "owner-1"),
}));

const { POST } = await import("./signin");

function createContext() {
  return {
    request: new Request("http://localhost/api/auth/signin", {
      method: "POST",
      body: new URLSearchParams({ email: "owner@example.com", password: "password" }),
    }),
    cookies: {},
    redirect: vi.fn((location: string) => new Response(null, { status: 302, headers: { location } })),
  };
}

describe("sign-in API route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getOwnerAccountDeletionRequestMock.mockResolvedValue(null);
  });

  it("redirects the owner to the app when there is no pending deletion", async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);
    const supabaseClient = {
      auth: {
        signInWithPassword: vi.fn().mockResolvedValue({
          data: { user: { id: "owner-1" } },
          error: null,
        }),
        signOut,
      },
    };
    createClientMock.mockReturnValue(supabaseClient);

    const response = await POST(createContext() as never);

    expect(response.headers.get("location")).toBe("/");
    expect(getOwnerAccountDeletionRequestMock).toHaveBeenCalledWith(supabaseClient, "owner-1");
    expect(signOut).not.toHaveBeenCalled();
  });

  it("signs out and shows a neutral message when deletion is pending", async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);
    createClientMock.mockReturnValue({
      auth: {
        signInWithPassword: vi.fn().mockResolvedValue({
          data: { user: { id: "owner-1" } },
          error: null,
        }),
        signOut,
      },
    });
    getOwnerAccountDeletionRequestMock.mockResolvedValue({
      userId: "owner-1",
      softDeletedAt: "2026-06-11T10:00:00.000Z",
    });

    const response = await POST(createContext() as never);

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(response.headers.get("location")).toBe("/auth/signin?message=Account%20deletion%20is%20pending");
  });

  it("keeps non-owner denial behavior unchanged", async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);
    createClientMock.mockReturnValue({
      auth: {
        signInWithPassword: vi.fn().mockResolvedValue({
          data: { user: { id: "someone-else" } },
          error: null,
        }),
        signOut,
      },
    });

    const response = await POST(createContext() as never);

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(response.headers.get("location")).toBe("/auth/signin?error=Access%20denied");
    expect(getOwnerAccountDeletionRequestMock).not.toHaveBeenCalled();
  });
});
