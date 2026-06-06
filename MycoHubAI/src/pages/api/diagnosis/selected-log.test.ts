import { beforeEach, describe, expect, it, vi } from "vitest";

const diagnoseSelectedLogMock = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const createClientMock = vi.fn<() => unknown>();

vi.mock("@/lib/diagnosis/service", () => ({
  diagnoseSelectedLog: diagnoseSelectedLogMock,
}));

vi.mock("@/lib/diagnosis/provider", () => ({
  createDiagnosisProvider: vi.fn(() => ({
    createQueryEmbedding: vi.fn(),
    generateDiagnosis: vi.fn(),
  })),
}));

vi.mock("@/lib/runtime-env", () => ({
  getOpenAiApiKey: vi.fn(() => "test-key"),
}));

vi.mock("@/lib/supabase", () => ({
  createClient: createClientMock,
}));

const { POST } = await import("./selected-log");

function createContext(body: unknown, user: { id: string } | null = { id: "owner-1" }) {
  return {
    request: new Request("http://localhost/api/diagnosis/selected-log", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
    locals: { user },
    cookies: {},
  };
}

describe("selected-log diagnosis API route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createClientMock.mockReturnValue({});
  });

  it("exports uppercase POST and returns JSON success responses", async () => {
    diagnoseSelectedLogMock.mockResolvedValue({
      ok: true,
      diagnosis: {
        scopeStatus: "missing_context",
        possibleCauses: [],
        suggestedActions: [],
        confidenceBand: null,
        uncertainty: "Need more selected-log detail.",
        followUpQuestion: "What changed visually?",
        sources: [],
      },
    });

    const response = await POST(createContext({ growLogId: "log-1", question: "Is this okay?" }) as never);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    const body: unknown = await response.json();

    expect(body).toMatchObject({ ok: true });
    expect(diagnoseSelectedLogMock).toHaveBeenCalledTimes(1);
    expect(diagnoseSelectedLogMock.mock.calls[0]?.slice(0, 3)).toEqual([
      {},
      "owner-1",
      { growLogId: "log-1", question: "Is this okay?" },
    ]);
  });

  it("validates request shape before service execution", async () => {
    const response = await POST(createContext({ growLogId: "", question: "" }) as never);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "invalid_request",
        message: "Invalid diagnosis request.",
        retryable: false,
      },
    });
    expect(diagnoseSelectedLogMock).not.toHaveBeenCalled();
  });

  it("returns unauthorized JSON before service execution", async () => {
    const response = await POST(createContext({ growLogId: "log-1", question: "Is this okay?" }, null) as never);

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: {
        code: "unauthorized",
      },
    });
    expect(diagnoseSelectedLogMock).not.toHaveBeenCalled();
  });
});
