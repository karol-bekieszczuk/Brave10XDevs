import { beforeEach, describe, expect, it, vi } from "vitest";

const updateGrowLogMock = vi.fn();
const createClientMock = vi.fn();

vi.mock("@/lib/grow-logs/repository", () => ({
  updateGrowLog: updateGrowLogMock,
}));

vi.mock("@/lib/supabase", () => ({
  createClient: createClientMock,
}));

const { POST } = await import("./update");

const VALID_ID = "550e8400-e29b-41d4-a716-446655440000";

function createContext(id = VALID_ID, input: { stage?: string; title?: string; body?: string } = {}) {
  const form = new FormData();
  form.set("stage", input.stage ?? "agar");
  form.set("title", input.title ?? "Plate A");
  form.set("body", input.body ?? "White growth is slow after transfer.");
  form.set("owner_id", "attacker-owner");

  return {
    request: new Request(`http://localhost/api/grow-logs/${id}/update`, { method: "POST", body: form }),
    params: { id },
    locals: { user: { id: "owner-1" } },
    cookies: {},
    redirect(location: string) {
      return new Response(null, { status: 302, headers: { location } });
    },
  };
}

describe("single grow-log update API route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createClientMock.mockReturnValue({});
  });

  it("rejects malformed IDs before repository mutation", async () => {
    const response = await POST(createContext("not-a-uuid") as never);

    expect(response.headers.get("location")).toBe("/grow-logs?error=Grow log not found");
    expect(updateGrowLogMock).not.toHaveBeenCalled();
  });

  it("uses the authenticated owner and ignores submitted owner fields", async () => {
    updateGrowLogMock.mockResolvedValue({ id: VALID_ID });

    const response = await POST(createContext() as never);

    expect(updateGrowLogMock).toHaveBeenCalledWith({}, VALID_ID, "owner-1", {
      stage: "agar",
      title: "Plate A",
      body: "White growth is slow after transfer.",
    });
    expect(response.headers.get("location")).toBe(`/grow-logs/${VALID_ID}`);
  });

  it("accepts exact text limits and rejects one-over values before repository mutation", async () => {
    updateGrowLogMock.mockResolvedValue({ id: VALID_ID });
    const title = "🍄".repeat(160);
    const body = "🍄".repeat(8_000);

    await POST(createContext(VALID_ID, { title, body }) as never);

    expect(updateGrowLogMock).toHaveBeenCalledWith({}, VALID_ID, "owner-1", { stage: "agar", title, body });

    updateGrowLogMock.mockClear();
    await POST(createContext(VALID_ID, { title: `${title}🍄`, body: `${body}🍄` }) as never);

    expect(updateGrowLogMock).not.toHaveBeenCalled();
  });
});
