import { readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildPullRequestReviewPrompt, pullRequestReviewRequestSchema } from "../src/index.js";
import { REACT_MIGRATION_COMPONENT_PATH, REACT_MIGRATION_HEAD_SHA } from "./assertions.js";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const caseRoot = path.join(moduleDirectory, "cases", "react-16-to-19-profile-editor");
const basePath = path.join(caseRoot, "base", REACT_MIGRATION_COMPONENT_PATH);
const headPath = path.join(caseRoot, "repository", REACT_MIGRATION_COMPONENT_PATH);
const behaviorContractPath = path.join(caseRoot, "repository", "src", "UserProfileEditor.contract.test.tsx");

const defectIdSchema = z.enum(["profile-prop-sync", "hook-state-replacement", "listener-cleanup-identity"]);
const oracleSchema = z
  .object({
    caseId: z.literal("react-16-to-19-profile-editor"),
    defects: z
      .array(
        z
          .object({
            id: defectIdSchema,
            path: z.literal(REACT_MIGRATION_COMPONENT_PATH),
            acceptableRange: z
              .object({ start: z.number().int().positive(), end: z.number().int().positive() })
              .refine(({ start, end }) => start <= end),
            severity: z.literal("error"),
            consequence: z.string().trim().min(1),
            repairSignals: z.array(z.string().trim().min(1)).min(2),
            forbiddenConflations: z.array(defectIdSchema).length(2),
          })
          .strict(),
      )
      .length(3),
  })
  .strict();

function normalize(content: string): string {
  return content.replace(/\r\n/gu, "\n");
}

function applyUnifiedPatch(base: string, patch: string): string {
  const source = normalize(base).split("\n");
  const patchLines = normalize(patch).split("\n");
  const result: string[] = [];
  let sourceIndex = 0;
  let patchIndex = 0;

  while (patchIndex < patchLines.length) {
    const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/u.exec(patchLines[patchIndex] ?? "");
    if (!header) {
      patchIndex += 1;
      continue;
    }

    const oldStart = Number(header[1]) - 1;
    const oldCount = Number(header[2] || "1");
    const newCount = Number(header[4] || "1");
    result.push(...source.slice(sourceIndex, oldStart));
    sourceIndex = oldStart;
    patchIndex += 1;

    let oldSeen = 0;
    let newSeen = 0;
    while (
      patchIndex < patchLines.length &&
      !patchLines[patchIndex]?.startsWith("@@ ") &&
      (oldSeen < oldCount || newSeen < newCount)
    ) {
      const line = patchLines[patchIndex] ?? "";
      if (line === "" && patchIndex === patchLines.length - 1) {
        patchIndex += 1;
        break;
      }

      const marker = line[0];
      const content = line.slice(1);
      if (marker === " " || marker === "-") {
        if (source[sourceIndex] !== content) {
          throw new Error(`Patch context drift at source line ${sourceIndex + 1}.`);
        }
        sourceIndex += 1;
        oldSeen += 1;
      }
      if (marker === " " || marker === "+") {
        result.push(content);
        newSeen += 1;
      }
      if (![" ", "-", "+", "\\"].includes(marker)) {
        throw new Error(`Unsupported patch line: ${line}`);
      }
      patchIndex += 1;
    }

    if (oldSeen !== oldCount || newSeen !== newCount) {
      throw new Error(
        `Patch hunk counts do not match ${header[0]}: expected ${oldCount}/${newCount}, saw ${oldSeen}/${newSeen}.`,
      );
    }
  }

  result.push(...source.slice(sourceIndex));
  return result.join("\n");
}

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
    }),
  );
  return files.flat().sort();
}

describe("React migration fixture contract", () => {
  it("keeps the typed request identity, changed path, and canonical patch fixed", async () => {
    const request = pullRequestReviewRequestSchema.parse(
      JSON.parse(await readFile(path.join(caseRoot, "request.json"), "utf8")),
    );
    const canonicalPatch = await readFile(path.join(caseRoot, "change.patch"), "utf8");

    expect(request).toMatchObject({
      baseSha: "1111111111111111111111111111111111111111",
      headSha: REACT_MIGRATION_HEAD_SHA,
      changedFiles: [
        {
          path: REACT_MIGRATION_COMPONENT_PATH,
          changeType: "modified",
          binary: false,
          submodule: false,
        },
      ],
    });
    expect(request.changedFiles).toHaveLength(1);
    expect(normalize(request.patch)).toBe(normalize(canonicalPatch));
  });

  it("reconstructs the committed head component by applying the canonical patch to the base", async () => {
    const [base, head, canonicalPatch] = await Promise.all([
      readFile(basePath, "utf8"),
      readFile(headPath, "utf8"),
      readFile(path.join(caseRoot, "change.patch"), "utf8"),
    ]);

    expect(applyUnifiedPatch(base, canonicalPatch)).toBe(normalize(head));
  });

  it("defines exactly three unique, mutually distinct oracle defects at valid head ranges", async () => {
    const oracle = oracleSchema.parse(JSON.parse(await readFile(path.join(caseRoot, "oracle.json"), "utf8")));
    const headLineCount = normalize(await readFile(headPath, "utf8")).split("\n").length - 1;
    const expectedIds = ["profile-prop-sync", "hook-state-replacement", "listener-cleanup-identity"];

    expect(oracle.defects.map(({ id }) => id).sort()).toEqual(expectedIds.sort());
    expect(new Set(oracle.defects.map(({ id }) => id)).size).toBe(3);
    for (const defect of oracle.defects) {
      expect(defect.acceptableRange.end).toBeLessThanOrEqual(headLineCount);
      expect(new Set(defect.forbiddenConflations)).toEqual(new Set(expectedIds.filter((id) => id !== defect.id)));
    }
  });

  it("keeps the oracle outside the reviewer root and out of the production prompt", async () => {
    const repositoryRoot = await realpath(path.join(caseRoot, "repository"));
    const oraclePath = await realpath(path.join(caseRoot, "oracle.json"));
    const repositoryFiles = await listFiles(repositoryRoot);
    const request = pullRequestReviewRequestSchema.parse(
      JSON.parse(await readFile(path.join(caseRoot, "request.json"), "utf8")),
    );
    const productionPrompt = buildPullRequestReviewPrompt(request);

    expect(path.relative(repositoryRoot, oraclePath)).toMatch(/^\.\./u);
    expect(repositoryFiles.map((file) => path.relative(repositoryRoot, file).replace(/\\/gu, "/"))).toEqual([
      "src/UserProfileEditor.contract.test.tsx",
      REACT_MIGRATION_COMPONENT_PATH,
    ]);
    for (const oracleId of defectIdSchema.options) {
      expect(productionPrompt).not.toContain(oracleId);
    }
  });

  it("provides unchanged behavioral evidence for all three approved regressions", async () => {
    const [base, head, behaviorContract] = await Promise.all([
      readFile(basePath, "utf8"),
      readFile(headPath, "utf8"),
      readFile(behaviorContractPath, "utf8"),
    ]);

    expect(base).toContain("previousProps.profile !== this.props.profile");
    expect(base).toContain('window.removeEventListener("online", this.handleOnline)');
    expect(head).toContain("setEditor(draftFromProfile(profile));\n  }, []);");
    expect(head).toContain("onChange={(event) => setEditor({ name: event.currentTarget.value })}");
    expect(head).toContain('window.removeEventListener("online", () => {');
    expect(behaviorContract).toContain("resynchronizes both draft fields when the profile prop identity changes");
    expect(behaviorContract).toContain("preserves the sibling draft field while editing either field");
    expect(behaviorContract).toContain("handles one online event after rerender and none after unmount");
    expect(behaviorContract).toContain("expect(onReconnect).toHaveBeenCalledTimes(1)");
  });
});
