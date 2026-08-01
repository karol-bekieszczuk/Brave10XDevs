import { beforeEach, describe, expect, it, vi } from "vitest";

const createGrowLogMock = vi.fn();
const createClientMock = vi.fn();

vi.mock("@/lib/grow-logs/repository", () => ({
  createGrowLog: createGrowLogMock,
}));

vi.mock("@/lib/supabase", () => ({
  createClient: createClientMock,
}));

const { POST } = await import("./create");

function createContext(input: { stage?: string; title?: string; body?: string } = {}) {
  const form = new FormData();
  form.set("stage", input.stage ?? "grain");
  form.set("title", input.title ?? "Jar A");
  form.set("body", input.body ?? "Recovering after shake.");
  form.set("owner_id", "attacker-owner");

  return {
    request: new Request("http://localhost/api/grow-logs/create", { method: "POST", body: form }),
    locals: { user: { id: "owner-1" } },
    cookies: {},
    redirect(location: string) {
      return new Response(null, { status: 302, headers: { location } });
    },
  };
}

describe("create grow-log API route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createClientMock.mockReturnValue({});
  });

  it("uses the authenticated owner and ignores submitted owner fields", async () => {
    createGrowLogMock.mockResolvedValue({ id: "550e8400-e29b-41d4-a716-446655440000" });

    const response = await POST(createContext() as never);

    expect(createGrowLogMock).toHaveBeenCalledWith({}, "owner-1", {
      stage: "grain",
      title: "Jar A",
      body: "Recovering after shake.",
    });
    expect(response.headers.get("location")).toBe("/grow-logs/550e8400-e29b-41d4-a716-446655440000");
  });

  it("accepts exact text limits and rejects one-over values before repository mutation", async () => {
    createGrowLogMock.mockResolvedValue({ id: "550e8400-e29b-41d4-a716-446655440000" });
    const title = "🍄".repeat(160);
    const body = "🍄".repeat(8_000);

    await POST(createContext({ title, body }) as never);

    expect(createGrowLogMock).toHaveBeenCalledWith({}, "owner-1", { stage: "grain", title, body });

    createGrowLogMock.mockClear();
    await POST(createContext({ title: `${title}🍄`, body: `${body}🍄` }) as never);

    expect(createGrowLogMock).not.toHaveBeenCalled();
  });
});
