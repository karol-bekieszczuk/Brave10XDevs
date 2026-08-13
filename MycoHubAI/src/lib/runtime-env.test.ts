import { beforeEach, describe, expect, it, vi } from "vitest";

interface RuntimeValues {
  AUTHORIZED_USER_ID?: string;
  OPENROUTER_API_KEY?: string;
  SUPABASE_ADMIN_KEY?: string;
  SUPABASE_KEY?: string;
  SUPABASE_URL?: string;
}

const cloudflareEnv = vi.hoisted<RuntimeValues>(() => ({}));
const astroEnv = vi.hoisted<RuntimeValues>(() => ({}));

vi.mock("cloudflare:workers", () => ({
  env: cloudflareEnv,
}));

vi.mock("astro:env/server", () => ({
  get AUTHORIZED_USER_ID() {
    return astroEnv.AUTHORIZED_USER_ID;
  },
  get OPENROUTER_API_KEY() {
    return astroEnv.OPENROUTER_API_KEY;
  },
  get SUPABASE_ADMIN_KEY() {
    return astroEnv.SUPABASE_ADMIN_KEY;
  },
  get SUPABASE_KEY() {
    return astroEnv.SUPABASE_KEY;
  },
  get SUPABASE_URL() {
    return astroEnv.SUPABASE_URL;
  },
}));

async function loadRuntimeEnv() {
  return import("./runtime-env");
}

describe("runtime environment resolution", () => {
  beforeEach(() => {
    vi.resetModules();

    const emptyRuntimeValues: RuntimeValues = {
      AUTHORIZED_USER_ID: undefined,
      OPENROUTER_API_KEY: undefined,
      SUPABASE_ADMIN_KEY: undefined,
      SUPABASE_KEY: undefined,
      SUPABASE_URL: undefined,
    };

    Object.assign(cloudflareEnv, emptyRuntimeValues);
    Object.assign(astroEnv, emptyRuntimeValues);
  });

  it("prefers non-blank Cloudflare bindings over Astro server env", async () => {
    Object.assign(cloudflareEnv, {
      AUTHORIZED_USER_ID: "cloudflare-owner",
      OPENROUTER_API_KEY: "cloudflare-provider-key",
      SUPABASE_ADMIN_KEY: "cloudflare-admin-key",
      SUPABASE_KEY: "cloudflare-anon-key",
      SUPABASE_URL: "https://cloudflare.example.test",
    });
    Object.assign(astroEnv, {
      AUTHORIZED_USER_ID: "astro-owner",
      OPENROUTER_API_KEY: "astro-provider-key",
      SUPABASE_ADMIN_KEY: "astro-admin-key",
      SUPABASE_KEY: "astro-anon-key",
      SUPABASE_URL: "https://astro.example.test",
    });

    const runtimeEnv = await loadRuntimeEnv();

    expect(runtimeEnv.getSupabaseEnv()).toEqual({
      url: "https://cloudflare.example.test",
      key: "cloudflare-anon-key",
    });
    expect(runtimeEnv.getAuthorizedUserId()).toBe("cloudflare-owner");
    expect(runtimeEnv.getOpenRouterApiKey()).toBe("cloudflare-provider-key");
    expect(runtimeEnv.getSupabaseAdminKey()).toBe("cloudflare-admin-key");
  });

  it("falls back to Astro server env when Cloudflare bindings are blank", async () => {
    Object.assign(cloudflareEnv, {
      AUTHORIZED_USER_ID: " ",
      OPENROUTER_API_KEY: "\t",
      SUPABASE_ADMIN_KEY: "\r\n",
      SUPABASE_KEY: "",
      SUPABASE_URL: undefined,
    });
    Object.assign(astroEnv, {
      AUTHORIZED_USER_ID: "astro-owner",
      OPENROUTER_API_KEY: "astro-provider-key",
      SUPABASE_ADMIN_KEY: "astro-admin-key",
      SUPABASE_KEY: "astro-anon-key",
      SUPABASE_URL: "https://astro.example.test",
    });

    const runtimeEnv = await loadRuntimeEnv();

    expect(runtimeEnv.getSupabaseEnv()).toEqual({
      url: "https://astro.example.test",
      key: "astro-anon-key",
    });
    expect(runtimeEnv.getAuthorizedUserId()).toBe("astro-owner");
    expect(runtimeEnv.getOpenRouterApiKey()).toBe("astro-provider-key");
    expect(runtimeEnv.getSupabaseAdminKey()).toBe("astro-admin-key");
  });

  it.each([undefined, "", "   ", "\t\r\n"])(
    "resolves missing and blank-equivalent values to undefined",
    async (blankValue) => {
      Object.assign(cloudflareEnv, {
        AUTHORIZED_USER_ID: blankValue,
        OPENROUTER_API_KEY: blankValue,
        SUPABASE_ADMIN_KEY: blankValue,
        SUPABASE_KEY: blankValue,
        SUPABASE_URL: blankValue,
      });
      Object.assign(astroEnv, cloudflareEnv);

      const runtimeEnv = await loadRuntimeEnv();

      expect(runtimeEnv.getSupabaseEnv()).toEqual({ url: undefined, key: undefined });
      expect(runtimeEnv.getAuthorizedUserId()).toBeUndefined();
      expect(runtimeEnv.getOpenRouterApiKey()).toBeUndefined();
      expect(runtimeEnv.getSupabaseAdminKey()).toBeUndefined();
    },
  );
});
