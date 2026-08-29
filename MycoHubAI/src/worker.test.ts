import { beforeEach, describe, expect, it, vi } from "vitest";

const handleMock = vi.fn();
const purgeDueAccountDeletionRequestsMock = vi.fn();
const reconcileUnfinalizedAccountDeletionsMock = vi.fn();
const consoleLogMock = vi.spyOn(console, "log").mockImplementation(() => undefined);

vi.mock("@astrojs/cloudflare/handler", () => ({
  handle: handleMock,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn((url: string, key: string) => ({ url, key })),
}));

vi.mock("@/lib/account-deletion/purge", () => ({
  purgeDueAccountDeletionRequests: purgeDueAccountDeletionRequestsMock,
}));

vi.mock("@/lib/account-deletion/reconciliation", () => ({
  reconcileUnfinalizedAccountDeletions: reconcileUnfinalizedAccountDeletionsMock,
}));

interface WorkerHandler {
  fetch(request: Request, env: Record<string, unknown>, ctx: ExecutionContext): Promise<Response>;
  scheduled(controller: ScheduledController, env: Record<string, unknown>, ctx: ExecutionContext): Promise<void>;
}

const workerModule = await import("./worker");
const worker = workerModule.default as unknown as WorkerHandler;

const executionContext = {
  passThroughOnException: vi.fn(),
  waitUntil: vi.fn(),
} as unknown as ExecutionContext;

const scheduledController: ScheduledController = {
  cron: "0 3 * * *",
  noRetry: vi.fn(),
  scheduledTime: Date.parse("2026-07-12T10:00:00.000Z"),
};

describe("worker entrypoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogMock.mockClear();
  });

  it("delegates fetch requests to Astro's Cloudflare handler", async () => {
    const response = new Response("ok");
    handleMock.mockResolvedValue(response);

    const result = await worker.fetch(new Request("http://localhost/dashboard"), {}, executionContext);

    expect(result).toBe(response);
    expect(handleMock).toHaveBeenCalledTimes(1);
  });

  it("reconciles unfinalized requests before purge and logs only aggregate counts", async () => {
    reconcileUnfinalizedAccountDeletionsMock.mockResolvedValue({
      configured: true,
      processed: 2,
      repaired: 1,
      deferred: 0,
      failed: 1,
    });
    purgeDueAccountDeletionRequestsMock.mockResolvedValue({
      configured: true,
      processed: 2,
      deleted: 1,
      failed: 1,
    });

    await worker.scheduled(
      scheduledController,
      { SUPABASE_URL: "https://example.supabase.co", SUPABASE_ADMIN_KEY: "admin-key" },
      executionContext,
    );

    const adminClient = {
      key: "admin-key",
      url: "https://example.supabase.co",
    };
    expect(reconcileUnfinalizedAccountDeletionsMock).toHaveBeenCalledWith(adminClient);
    expect(purgeDueAccountDeletionRequestsMock).toHaveBeenCalledWith({ adminClient });
    expect(reconcileUnfinalizedAccountDeletionsMock.mock.invocationCallOrder[0]).toBeLessThan(
      purgeDueAccountDeletionRequestsMock.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
    expect(consoleLogMock).toHaveBeenCalledWith(
      "account deletion reconciliation configured=true processed=2 repaired=1 deferred=0 failed=1 purge_configured=true purge_processed=2 purge_deleted=1 purge_failed=1",
    );
    expect(consoleLogMock.mock.calls.join(" ")).not.toContain("grow log");
  });
});
