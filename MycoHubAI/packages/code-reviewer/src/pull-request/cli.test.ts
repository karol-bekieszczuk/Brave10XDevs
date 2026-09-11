import { describe, expect, it } from "vitest";
import { runPullRequestCli } from "./cli.js";
describe("PR CLI", () => {
  it("fails before filesystem or network work when required execution inputs are absent", async () => {
    await expect(runPullRequestCli({ environment: {}, writeOutput: () => undefined })).resolves.toBe(1);
  });
});
