import { describe, expect, it, vi } from "vitest";
import { GitHubApiError, GitHubClient } from "./github-client.js";
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
describe("GitHub client", () => {
  it("paginates bot comments and updates only the marked one", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        response(Array.from({ length: 100 }, (_, id) => ({ id, body: "human", user: { type: "User" } }))),
      )
      .mockResolvedValueOnce(response([{ id: 101, body: "<!-- marker -->", user: { type: "Bot" } }]));
    const client = new GitHubClient({ token: "secret", repository: "o/r", pullRequestNumber: 1, fetch: fetcher });
    await expect(client.findMarkedComment("<!-- marker -->")).resolves.toMatchObject({ id: 101 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("creates absent labels and redacts API errors", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({ message: "token=leak" }, 404))
      .mockResolvedValueOnce(response({}));
    const client = new GitHubClient({ token: "secret", repository: "o/r", pullRequestNumber: 1, fetch: fetcher });
    await client.ensureLabel("ai-cr:passed");
    expect(fetcher.mock.calls[1]?.[1]).toMatchObject({ method: "POST" });
    const message = new GitHubApiError("authorization=leak").message;
    expect(message).toBe("authorization=[redacted]");
    expect(message).not.toContain("leak");
  });
  it("propagates non-404 API failures without token values", async () => {
    const client = new GitHubClient({
      token: "secret",
      repository: "o/r",
      pullRequestNumber: 1,
      fetch: vi.fn().mockResolvedValue(response({ message: "secret=leak" }, 500)),
    });
    await expect(client.getLabels()).rejects.toThrow("[redacted]");
  });
});
