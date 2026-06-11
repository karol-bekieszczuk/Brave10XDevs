import { beforeEach, describe, expect, it, vi } from "vitest";

const deleteOwnerGrowLogsMock = vi.fn<(...args: unknown[]) => Promise<void>>();
const createClientMock = vi.fn();

vi.mock("@/lib/grow-logs/repository", () => ({
  deleteOwnerGrowLogs: deleteOwnerGrowLogsMock,
}));

vi.mock("@/lib/supabase", () => ({
  createClient: createClientMock,
}));

const { POST } = await import("./bulk-delete");

function createContext(
  selectedValues: string[],
  options: {
    user?: { id: string } | null;
    supabase?: object | null;
  } = {},
) {
  const form = new FormData();

  for (const value of selectedValues) {
    form.append("selectedLogIds", value);
  }

  const request = new Request("http://localhost/api/grow-logs/bulk-delete", {
    method: "POST",
    body: form,
  });

  return {
    request,
    locals: { user: options.user ?? { id: "owner-1" } },
    cookies: {},
    redirect(location: string) {
      return new Response(null, {
        status: 302,
        headers: { location },
      });
    },
  };
}

describe("bulk-delete grow-log API route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createClientMock.mockReturnValue({});
    deleteOwnerGrowLogsMock.mockResolvedValue();
  });

  it("exports uppercase POST and deletes validated ids for the authenticated owner", async () => {
    const response = await POST(
      createContext(["550e8400-e29b-41d4-a716-446655440000", "550e8400-e29b-41d4-a716-446655440000"]) as never,
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/grow-logs?message=Selected%20grow%20logs%20deleted.");
    expect(deleteOwnerGrowLogsMock).toHaveBeenCalledWith({}, ["550e8400-e29b-41d4-a716-446655440000"], "owner-1");
  });

  it("rejects empty effective selections before repository deletion", async () => {
    const response = await POST(createContext([]) as never);

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/grow-logs?error=Select%20at%20least%20one%20grow%20log");
    expect(deleteOwnerGrowLogsMock).not.toHaveBeenCalled();
  });

  it("ignores malformed ids and still rejects when no valid ids remain", async () => {
    const response = await POST(createContext(["not-a-uuid", "still-bad"]) as never);

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/grow-logs?error=Select%20at%20least%20one%20grow%20log");
    expect(deleteOwnerGrowLogsMock).not.toHaveBeenCalled();
  });

  it("redirects to sign-in when auth context is unavailable", async () => {
    createClientMock.mockReturnValue(null);

    const response = await POST(createContext(["550e8400-e29b-41d4-a716-446655440000"], { user: null }) as never);

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/auth/signin?error=Unable%20to%20delete%20selected%20grow%20logs");
    expect(deleteOwnerGrowLogsMock).not.toHaveBeenCalled();
  });

  it("keeps redirect URLs free of submitted ids and titles on repository failure", async () => {
    deleteOwnerGrowLogsMock.mockRejectedValue(new Error("boom"));

    const response = await POST(createContext(["550e8400-e29b-41d4-a716-446655440000"]) as never);

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/grow-logs?error=Unable%20to%20delete%20selected%20grow%20logs");
    expect(response.headers.get("location")).not.toContain("550e8400-e29b-41d4-a716-446655440000");
    expect(response.headers.get("location")).not.toContain("Plate");
  });
});
