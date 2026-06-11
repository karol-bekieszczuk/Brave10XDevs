import { describe, expect, it, vi } from "vitest";
import { safeSignOut } from "@/lib/auth-session";

describe("safeSignOut", () => {
  it("calls Supabase signOut and clears sb cookies", async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);
    const cookies = {
      set: vi.fn(),
    };
    const headers = new Headers({
      Cookie: "sb-project-auth-token=token; sb-project-auth-token.0=chunk; other=value",
    });

    await safeSignOut({ auth: { signOut } } as never, headers, cookies as never);

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(cookies.set).toHaveBeenCalledTimes(2);
    expect(cookies.set).toHaveBeenNthCalledWith(
      1,
      "sb-project-auth-token",
      "",
      expect.objectContaining({ path: "/", maxAge: 0 }),
    );
    expect(cookies.set).toHaveBeenNthCalledWith(
      2,
      "sb-project-auth-token.0",
      "",
      expect.objectContaining({ path: "/", maxAge: 0 }),
    );
  });

  it("still clears cookies when Supabase signOut throws", async () => {
    const cookies = {
      set: vi.fn(),
    };
    const headers = new Headers({
      Cookie: "sb-project-auth-token=broken",
    });

    await safeSignOut(
      {
        auth: {
          signOut: vi.fn().mockRejectedValue(new Error("Expected 3 parts in JWT; got 1")),
        },
      } as never,
      headers,
      cookies as never,
    );

    expect(cookies.set).toHaveBeenCalledWith(
      "sb-project-auth-token",
      "",
      expect.objectContaining({ path: "/", maxAge: 0 }),
    );
  });
});
