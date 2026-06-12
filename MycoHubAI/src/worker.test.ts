import { beforeEach, describe, expect, it, vi } from "vitest";

const handleMock = vi.fn();
const purgeDueAccountDeletionRequestsMock = vi.fn();
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

interface WorkerHandler {
  fetch(request: Request, env: Record<string, unknown>, ctx: ExecutionContext): Promise<Response>;
  scheduled(controller: ScheduledController, env: Record<string, unknown>, ctx: ExecutionContext): Promise<void>;
}

const workerModule = await import("./worker");
const worker = workerModule.default as unknown as WorkerHandler;

const executionContext: ExecutionContext = {
  passThroughOnException: vi.fn(),
  waitUntil: vi.fn(),
};

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

  it("runs the scheduled purge and logs only aggregate counts", async () => {
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

    expect(purgeDueAccountDeletionRequestsMock).toHaveBeenCalledWith({
      adminClient: {
        key: "admin-key",
        url: "https://example.supabase.co",
      },
    });
    expect(consoleLogMock).toHaveBeenCalledWith(
      "account deletion purge configured=true processed=2 deleted=1 failed=1",
    );
    expect(consoleLogMock.mock.calls.join(" ")).not.toContain("grow log");
  });
});
