import { beforeEach, describe, expect, it, vi } from "vitest";

const deleteGrowLogMock = vi.fn<(...args: unknown[]) => Promise<void>>();
const getOwnerGrowLogMock = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const createClientMock = vi.fn();

vi.mock("@/lib/grow-logs/repository", () => ({
  deleteGrowLog: deleteGrowLogMock,
  getOwnerGrowLog: getOwnerGrowLogMock,
}));

vi.mock("@/lib/supabase", () => ({
  createClient: createClientMock,
}));

const { POST } = await import("./delete");

const VALID_ID = "550e8400-e29b-41d4-a716-446655440000";

function createContext(user: { id: string } | null = { id: "owner-1" }, id = VALID_ID) {
  return {
    request: new Request(`http://localhost/api/grow-logs/${id}/delete`, {
      method: "POST",
    }),
    params: { id },
    locals: { user },
    cookies: {},
    redirect(location: string) {
      return new Response(null, {
        status: 302,
        headers: { location },
      });
    },
  };
}

describe("single grow-log delete API route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createClientMock.mockReturnValue({});
  });

  it("continues to delete the owner's row and redirect back to the list", async () => {
    getOwnerGrowLogMock.mockResolvedValue({ id: VALID_ID });
    deleteGrowLogMock.mockResolvedValue();

    const response = await POST(createContext() as never);

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/grow-logs");
    expect(getOwnerGrowLogMock).toHaveBeenCalledWith({}, VALID_ID, "owner-1");
    expect(deleteGrowLogMock).toHaveBeenCalledWith({}, VALID_ID, "owner-1");
  });

  it("rejects malformed IDs before owner lookup or deletion", async () => {
    const response = await POST(createContext({ id: "owner-1" }, "not-a-uuid") as never);

    expect(response.headers.get("location")).toBe("/grow-logs?error=Grow log not found");
    expect(getOwnerGrowLogMock).not.toHaveBeenCalled();
    expect(deleteGrowLogMock).not.toHaveBeenCalled();
  });

  it("keeps missing and non-owner rows indistinguishable without deleting", async () => {
    getOwnerGrowLogMock.mockResolvedValue(null);

    const response = await POST(createContext() as never);

    expect(response.headers.get("location")).toBe("/grow-logs?error=Grow log not found");
    expect(deleteGrowLogMock).not.toHaveBeenCalled();
  });

  it("keeps submitted IDs out of failure redirects", async () => {
    getOwnerGrowLogMock.mockResolvedValue({ id: VALID_ID });
    deleteGrowLogMock.mockRejectedValue(new Error("delete failed"));

    const response = await POST(createContext() as never);

    expect(response.headers.get("location")).toBe("/grow-logs?error=Unable to delete grow log");
    expect(response.headers.get("location")).not.toContain(VALID_ID);
  });
});
