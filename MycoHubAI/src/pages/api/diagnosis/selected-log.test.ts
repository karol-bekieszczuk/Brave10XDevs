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
  getOpenRouterApiKey: vi.fn(() => "test-key"),
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
    const dependenciesArg = diagnoseSelectedLogMock.mock.calls[0]?.[3] as { createProvider?: unknown };
    expect(typeof dependenciesArg.createProvider).toBe("function");
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

  it.each([
    {
      code: "invalid_request",
      message: "Invalid diagnosis request.",
      status: 400,
      retryable: false,
    },
    {
      code: "unsupported_stage",
      message: "Diagnosis supports agar and grain logs only.",
      status: 400,
      retryable: false,
    },
    {
      code: "unauthorized",
      message: "Sign in to diagnose a grow log.",
      status: 401,
      retryable: false,
    },
    {
      code: "grow_log_not_found",
      message: "Grow log not found.",
      status: 404,
      retryable: false,
    },
    {
      code: "retrieval_failed",
      message: "Diagnosis retrieval failed.",
      status: 502,
      retryable: true,
    },
    {
      code: "invalid_model_output",
      message: "Diagnosis provider returned invalid structured output.",
      status: 502,
      retryable: true,
    },
    {
      code: "provider_failed",
      message: "Diagnosis generation failed.",
      status: 502,
      retryable: true,
    },
    {
      code: "provider_timeout",
      message: "Diagnosis provider timed out.",
      status: 502,
      retryable: true,
    },
  ])("maps $code service errors to a controlled $status response", async ({ code, message, status, retryable }) => {
    diagnoseSelectedLogMock.mockResolvedValue({
      ok: false,
      error: {
        code,
        message,
        retryable,
      },
    });

    const response = await POST(createContext({ growLogId: "log-1", question: "Is this okay?" }) as never);

    expect(response.status).toBe(status);
    const body: unknown = await response.json();
    expect(body).toEqual({
      ok: false,
      error: {
        code,
        message,
        retryable,
      },
    });
  });
});
