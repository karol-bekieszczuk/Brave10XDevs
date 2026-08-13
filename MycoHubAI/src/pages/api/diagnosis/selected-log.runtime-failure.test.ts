import { beforeEach, describe, expect, it, vi } from "vitest";
import { diagnosisApiResponseSchema } from "@/lib/diagnosis/schema";
import type { GrowLogRow } from "@/lib/grow-logs/types";

const createClientMock = vi.hoisted(() => vi.fn());
const getOwnerGrowLogMock = vi.hoisted(() => vi.fn());
const acquireDiagnosisAdmissionMock = vi.hoisted(() => vi.fn());
const releaseDiagnosisAdmissionMock = vi.hoisted(() => vi.fn());
const createOpenRouterMock = vi.hoisted(() => vi.fn());
const embedMock = vi.hoisted(() => vi.fn());
const generateTextMock = vi.hoisted(() => vi.fn());

vi.mock("cloudflare:workers", () => ({
  env: {
    OPENROUTER_API_KEY: "   ",
  },
}));

vi.mock("astro:env/server", () => ({
  AUTHORIZED_USER_ID: undefined,
  OPENROUTER_API_KEY: "\t",
  SUPABASE_ADMIN_KEY: undefined,
  SUPABASE_KEY: undefined,
  SUPABASE_URL: undefined,
}));

vi.mock("@/lib/supabase", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/grow-logs/repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/grow-logs/repository")>()),
  getOwnerGrowLog: getOwnerGrowLogMock,
}));

vi.mock("@/lib/diagnosis/admission", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/diagnosis/admission")>()),
  acquireDiagnosisAdmission: acquireDiagnosisAdmissionMock,
  releaseDiagnosisAdmission: releaseDiagnosisAdmissionMock,
}));

vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: createOpenRouterMock,
}));

vi.mock("ai", () => ({
  embed: embedMock,
  generateText: generateTextMock,
  Output: {
    object: vi.fn((input: unknown) => input),
  },
}));

const { POST } = await import("./selected-log");

const client = {};
const growLog: GrowLogRow = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  ownerId: "owner-runtime-failure",
  stage: "agar",
  title: "GROW_LOG_TITLE_SENTINEL",
  body: "GROW_LOG_BODY_SENTINEL with visible white growth after transfer.",
  createdAt: "2026-08-13T10:00:00.000Z",
  updatedAt: "2026-08-13T11:00:00.000Z",
};

function createContext() {
  return {
    request: new Request("http://localhost/api/diagnosis/selected-log", {
      method: "POST",
      body: JSON.stringify({
        growLogId: growLog.id,
        question: "Is growth stalled? RAW_ERROR_SENTINEL SECRET_VALUE_SENTINEL",
      }),
      headers: { "content-type": "application/json" },
    }),
    locals: { user: { id: growLog.ownerId } },
    cookies: {},
  };
}

describe("selected-log missing-provider runtime failure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createClientMock.mockReturnValue(client);
    getOwnerGrowLogMock.mockResolvedValue(growLog);
    acquireDiagnosisAdmissionMock.mockResolvedValue({ admitted: true, claimId: "claim-runtime-failure" });
    releaseDiagnosisAdmissionMock.mockResolvedValue(undefined);
  });

  it("returns a controlled redacted failure and releases admission without provider work", async () => {
    const response = await POST(createContext() as never);
    const body: unknown = await response.json();
    const parsed = diagnosisApiResponseSchema.safeParse(body);
    const serialized = JSON.stringify(body);

    expect(parsed.success).toBe(true);
    expect(body).toEqual({
      ok: false,
      error: {
        code: "provider_failed",
        message: "Diagnosis is temporarily unavailable. Try again.",
        retryable: true,
      },
    });
    expect(serialized).not.toMatch(
      /OpenRouter|API key|configur|RAW_ERROR_SENTINEL|SECRET_VALUE_SENTINEL|GROW_LOG_TITLE_SENTINEL|GROW_LOG_BODY_SENTINEL/i,
    );
    expect(getOwnerGrowLogMock).toHaveBeenCalledWith(client, growLog.id, growLog.ownerId);
    expect(acquireDiagnosisAdmissionMock).toHaveBeenCalledWith(
      client,
      growLog.ownerId,
      growLog.id,
      "Is growth stalled? RAW_ERROR_SENTINEL SECRET_VALUE_SENTINEL",
    );
    expect(releaseDiagnosisAdmissionMock).toHaveBeenCalledWith(client, "claim-runtime-failure");
    expect(createOpenRouterMock).not.toHaveBeenCalled();
    expect(embedMock).not.toHaveBeenCalled();
    expect(generateTextMock).not.toHaveBeenCalled();
  });
});
