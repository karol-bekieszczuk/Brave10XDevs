import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const getSupabaseAdminKeyMock = vi.fn();
const getSupabaseEnvMock = vi.fn();

vi.mock("@/lib/runtime-env", () => ({
  getSupabaseAdminKey: getSupabaseAdminKeyMock,
  getSupabaseEnv: getSupabaseEnvMock,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock,
}));

const { createAdminClient, getSupabaseAdminConfig } = await import("./supabase-admin");

describe("supabase admin client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSupabaseEnvMock.mockReturnValue({ url: "https://example.supabase.co", key: "anon-key" });
    getSupabaseAdminKeyMock.mockReturnValue("admin-key");
    createClientMock.mockReturnValue({ auth: { admin: {} } });
  });

  it("fails closed when the url is missing", () => {
    getSupabaseEnvMock.mockReturnValue({ url: "", key: "anon-key" });

    expect(getSupabaseAdminConfig()).toEqual({
      url: "",
      adminKey: "admin-key",
      isConfigured: false,
    });
    expect(createAdminClient()).toBeNull();
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("fails closed when the admin key is missing", () => {
    getSupabaseAdminKeyMock.mockReturnValue("");

    expect(getSupabaseAdminConfig()).toEqual({
      url: "https://example.supabase.co",
      adminKey: "",
      isConfigured: false,
    });
    expect(createAdminClient()).toBeNull();
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("constructs a non-persisted server client when config is present", () => {
    const client = createAdminClient();

    expect(client).toEqual({ auth: { admin: {} } });
    expect(createClientMock).toHaveBeenCalledWith("https://example.supabase.co", "admin-key", {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  });
});
