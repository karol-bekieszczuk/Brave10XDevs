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

function createContext(user: { id: string } | null = { id: "owner-1" }, id = "log-1") {
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
    getOwnerGrowLogMock.mockResolvedValue({ id: "log-1" });
    deleteGrowLogMock.mockResolvedValue();

    const response = await POST(createContext() as never);

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/grow-logs");
    expect(getOwnerGrowLogMock).toHaveBeenCalledWith({}, "log-1", "owner-1");
    expect(deleteGrowLogMock).toHaveBeenCalledWith({}, "log-1", "owner-1");
  });
});
