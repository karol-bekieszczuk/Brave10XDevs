import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ generateResponse: vi.fn() }));

vi.mock("./generate-response.js", () => ({ generateResponse: mocks.generateResponse }));

describe("CLI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generateResponse.mockResolvedValue({ findings: [] });
  });

  it("joins argv into the requested review prompt and writes pretty JSON", async () => {
    const { runCli } = await import("./cli.js");
    const output = vi.fn();

    await expect(
      runCli({ argv: ["Review", "the", "change"], repositoryRoot: "C:/review-root", writeOutput: output }),
    ).resolves.toBe(0);

    expect(mocks.generateResponse).toHaveBeenCalledWith("Review the change", process.env, "C:/review-root");
    expect(output).toHaveBeenCalledWith('{\n  "findings": []\n}');
  });

  it("uses the default request when no argv prompt is supplied", async () => {
    const { runCli } = await import("./cli.js");

    await runCli({ argv: [], repositoryRoot: "C:/review-root", writeOutput: vi.fn() });

    expect(mocks.generateResponse).toHaveBeenCalledWith(
      "Review this repository for actionable correctness, security, reliability, and maintainability issues.",
      process.env,
      "C:/review-root",
    );
  });

  it("writes failures to stderr and returns a non-zero exit code", async () => {
    const { runCli } = await import("./cli.js");
    const writeError = vi.fn();
    const failure = new Error("provider unavailable");
    mocks.generateResponse.mockRejectedValueOnce(failure);

    await expect(runCli({ argv: ["Review"], writeError })).resolves.toBe(1);
    expect(writeError).toHaveBeenCalledWith(failure);
  });
});
