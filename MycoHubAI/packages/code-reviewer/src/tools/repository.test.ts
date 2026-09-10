import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readRepositoryFile, repositoryTools, searchRepositoryText } from "./repository.js";

describe("repository tools", () => {
  let fixtureBase: string;
  let repositoryRoot: string;
  let outsideRoot: string;

  beforeEach(async () => {
    fixtureBase = await mkdtemp(path.join(tmpdir(), "code-reviewer-tools-"));
    repositoryRoot = path.join(fixtureBase, "repository");
    outsideRoot = path.join(fixtureBase, "outside");
    await mkdir(path.join(repositoryRoot, "src"), { recursive: true });
    await mkdir(outsideRoot, { recursive: true });
    await writeFile(path.join(repositoryRoot, "src", "example.ts"), "first line\nconst defect = true;\nlast line\n");
    await writeFile(path.join(outsideRoot, "secret.txt"), "outside secret\n");
  });

  afterEach(async () => {
    await rm(fixtureBase, { recursive: true, force: true });
  });

  it("declares call-scoped context for both tools", () => {
    expect(repositoryTools.readFile.contextSchema).toBeDefined();
    expect(repositoryTools.searchText.contextSchema).toBeDefined();
  });

  it("reads bounded text and returns a normalized repository-relative path", async () => {
    await expect(readRepositoryFile({ path: "src/example.ts" }, { repositoryRoot })).resolves.toEqual({
      filePath: "src/example.ts",
      content: "first line\nconst defect = true;\nlast line\n",
    });
  });

  it.each(["../outside/secret.txt", "src/../../outside/secret.txt"])("rejects traversal path %s", async (filePath) => {
    await expect(readRepositoryFile({ path: filePath }, { repositoryRoot })).rejects.toThrow("parent traversal");
  });

  it.each([path.resolve("absolute.txt"), "C:\\absolute.txt", "/absolute.txt"])(
    "rejects absolute path %s",
    async (filePath) => {
      await expect(readRepositoryFile({ path: filePath }, { repositoryRoot })).rejects.toThrow("absolute paths");
    },
  );

  it("rejects a sibling-prefix escape", async () => {
    const sibling = `${repositoryRoot}-other`;
    await mkdir(sibling);
    await writeFile(path.join(sibling, "secret.txt"), "secret");
    await expect(readRepositoryFile({ path: "../repository-other/secret.txt" }, { repositoryRoot })).rejects.toThrow(
      "parent traversal",
    );
  });

  it("rejects symlink traversal outside the repository", async () => {
    const linkPath = path.join(repositoryRoot, "external");
    await symlink(outsideRoot, linkPath, process.platform === "win32" ? "junction" : "dir");
    await expect(readRepositoryFile({ path: "external/secret.txt" }, { repositoryRoot })).rejects.toThrow(
      "symbolic link",
    );
  });

  it("rejects oversized and binary files", async () => {
    await writeFile(path.join(repositoryRoot, "oversized.txt"), Buffer.alloc(256 * 1024 + 1, 65));
    await writeFile(path.join(repositoryRoot, "binary.dat"), Buffer.from([65, 0, 66]));
    await expect(readRepositoryFile({ path: "oversized.txt" }, { repositoryRoot })).rejects.toThrow("256 KiB");
    await expect(readRepositoryFile({ path: "binary.dat" }, { repositoryRoot })).rejects.toThrow("binary");
  });

  it("finds literal text with paths and exact one-based line numbers", async () => {
    await expect(searchRepositoryText({ query: "defect" }, { repositoryRoot })).resolves.toEqual({
      matches: [{ filePath: "src/example.ts", line: 2, text: "const defect = true;" }],
      truncated: false,
    });
  });

  it("limits search to the requested subtree", async () => {
    await mkdir(path.join(repositoryRoot, "docs"));
    await writeFile(path.join(repositoryRoot, "docs", "note.txt"), "defect in docs\n");
    const result = await searchRepositoryText({ query: "defect", subtree: "src" }, { repositoryRoot });
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.filePath).toBe("src/example.ts");
  });

  it("returns an empty result when literal text is absent", async () => {
    await expect(searchRepositoryText({ query: "not present" }, { repositoryRoot })).resolves.toEqual({
      matches: [],
      truncated: false,
    });
  });

  it("skips ignored directories, binary files, oversized files, and symlinks", async () => {
    for (const directory of [".git", "node_modules", "dist"]) {
      await mkdir(path.join(repositoryRoot, directory));
      await writeFile(path.join(repositoryRoot, directory, "ignored.txt"), "outside secret\n");
    }
    await writeFile(path.join(repositoryRoot, "binary.dat"), Buffer.from("outside secret\0"));
    await writeFile(path.join(repositoryRoot, "oversized.txt"), Buffer.alloc(256 * 1024 + 1, 65));
    await symlink(
      outsideRoot,
      path.join(repositoryRoot, "external"),
      process.platform === "win32" ? "junction" : "dir",
    );

    await expect(searchRepositoryText({ query: "outside secret" }, { repositoryRoot })).resolves.toEqual({
      matches: [],
      truncated: false,
    });
  });

  it("returns at most 50 matches and reports truncation", async () => {
    await writeFile(path.join(repositoryRoot, "many.txt"), Array.from({ length: 51 }, () => "match").join("\n"));
    const result = await searchRepositoryText({ query: "match" }, { repositoryRoot });
    expect(result.matches).toHaveLength(50);
    expect(result.truncated).toBe(true);
  });

  it("rejects an empty query and unsafe search subtrees", async () => {
    await expect(searchRepositoryText({ query: "" }, { repositoryRoot })).rejects.toThrow();
    await expect(searchRepositoryText({ query: "secret", subtree: "../outside" }, { repositoryRoot })).rejects.toThrow(
      "parent traversal",
    );
    await expect(searchRepositoryText({ query: "secret", subtree: "external" }, { repositoryRoot })).rejects.toThrow(
      "does not exist",
    );
  });
});
