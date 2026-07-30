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

function createContext() {
  const form = new FormData();
  form.set("stage", "grain");
  form.set("title", "Jar A");
  form.set("body", "Recovering after shake.");
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
});
