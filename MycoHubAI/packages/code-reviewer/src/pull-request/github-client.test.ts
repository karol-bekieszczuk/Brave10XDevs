import { describe, expect, it, vi } from "vitest";
import { GitHubApiError, GitHubClient } from "./github-client.js";
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
describe("GitHub client", () => {
  it("paginates bot comments and updates only the marked one", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
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
  it("uses the expected endpoints for comment, head, and label mutations", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const responses = [
      response({}),
      response({}),
      response({ head: { sha: "b".repeat(40) } }),
      response([{ name: "bug" }]),
      response({}),
      response({}),
    ];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      calls.push({ url, init });
      const nextResponse = responses.shift();
      if (!nextResponse) throw new Error("Unexpected GitHub API call.");
      return Promise.resolve(nextResponse);
    });
    const client = new GitHubClient({ token: "secret", repository: "o/r", pullRequestNumber: 7, fetch: fetcher });

    await client.createComment("created");
    await client.updateComment(41, "updated");
    await expect(client.getCurrentHeadSha()).resolves.toBe("b".repeat(40));
    await expect(client.getLabels()).resolves.toEqual(["bug"]);
    await client.addLabel("ai-cr:passed");
    await client.removeLabel("ai-cr:failed");

    expect(calls.map(({ url }) => url)).toEqual([
      "https://api.github.com/repos/o/r/issues/7/comments",
      "https://api.github.com/repos/o/r/issues/comments/41",
      "https://api.github.com/repos/o/r/pulls/7",
      "https://api.github.com/repos/o/r/issues/7/labels",
      "https://api.github.com/repos/o/r/issues/7/labels",
      "https://api.github.com/repos/o/r/issues/7/labels/ai-cr%3Afailed",
    ]);
    expect(calls.map(({ init }) => init?.method ?? "GET")).toEqual(["POST", "PATCH", "GET", "GET", "POST", "DELETE"]);
    expect(calls[0]?.init?.body).toBe(JSON.stringify({ body: "created" }));
    expect(calls[4]?.init?.body).toBe(JSON.stringify({ labels: ["ai-cr:passed"] }));
  });
  it.each([
    ["create comment", (client: GitHubClient) => client.createComment("body")],
    ["update comment", (client: GitHubClient) => client.updateComment(41, "body")],
    ["add label", (client: GitHubClient) => client.addLabel("ai-cr:passed")],
    ["remove label", (client: GitHubClient) => client.removeLabel("ai-cr:failed")],
  ])("propagates a redacted %s API failure", async (_name, operation) => {
    const client = new GitHubClient({
      token: "secret",
      repository: "o/r",
      pullRequestNumber: 1,
      fetch: vi.fn().mockResolvedValue(response({ message: "token=leak" }, 500)),
    });

    await expect(operation(client)).rejects.toThrow("[redacted]");
  });
});
