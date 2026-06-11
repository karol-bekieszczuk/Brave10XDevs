import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const getOwnerAccountDeletionRequestMock = vi.fn();

vi.mock("astro:middleware", () => ({
  defineMiddleware: (handler: unknown) => handler,
}));

vi.mock("@/lib/supabase", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/account-deletion/repository", () => ({
  getOwnerAccountDeletionRequest: getOwnerAccountDeletionRequestMock,
}));

vi.mock("@/lib/runtime-env", () => ({
  getAuthorizedUserId: vi.fn(() => "owner-1"),
}));

const { onRequest } = await import("./middleware");

function createContext(pathname: string) {
  return {
    request: new Request(`http://localhost${pathname}`),
    url: new URL(`http://localhost${pathname}`),
    cookies: {},
    locals: { user: null },
    redirect: vi.fn((location: string) => new Response(null, { status: 302, headers: { location } })),
  };
}

describe("middleware pending deletion handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getOwnerAccountDeletionRequestMock.mockResolvedValue(null);
  });

  it("blocks pending-deletion users on protected routes and signs them out", async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);
    createClientMock.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "owner-1" } } }),
        signOut,
      },
    });
    getOwnerAccountDeletionRequestMock.mockResolvedValue({
      userId: "owner-1",
      softDeletedAt: "2026-06-11T10:00:00.000Z",
    });
    const context = createContext("/dashboard");
    const next = vi.fn(() => Promise.resolve(new Response("ok")));

    const response = (await onRequest(context as never, next)) as Response;

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(response.headers.get("location")).toBe("/auth/signin?message=Account%20deletion%20is%20pending");
    expect(next).not.toHaveBeenCalled();
  });

  it("allows the owner through when there is no pending deletion", async () => {
    createClientMock.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "owner-1" } } }),
        signOut: vi.fn().mockResolvedValue(undefined),
      },
    });
    const context = createContext("/dashboard");
    const nextResponse = new Response("ok");
    const next = vi.fn(() => Promise.resolve(nextResponse));

    const response = (await onRequest(context as never, next)) as Response;

    expect(response).toBe(nextResponse);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("does not call getUser for the public sign-in route", async () => {
    const getUser = vi.fn();
    createClientMock.mockReturnValue({
      auth: {
        getUser,
        signOut: vi.fn().mockResolvedValue(undefined),
      },
    });
    const context = createContext("/auth/signin");
    const nextResponse = new Response("ok");
    const next = vi.fn(() => Promise.resolve(nextResponse));

    const response = (await onRequest(context as never, next)) as Response;

    expect(response).toBe(nextResponse);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("treats getUser failures as unauthenticated instead of throwing", async () => {
    createClientMock.mockReturnValue({
      auth: {
        getUser: vi.fn().mockRejectedValue(new Error("Expected 3 parts in JWT; got 1")),
        signOut: vi.fn().mockResolvedValue(undefined),
      },
    });
    const context = createContext("/dashboard");
    const next = vi.fn(() => Promise.resolve(new Response("ok")));

    const response = (await onRequest(context as never, next)) as Response;

    expect(response.headers.get("location")).toBe("/auth/signin");
    expect(next).not.toHaveBeenCalled();
  });
});
