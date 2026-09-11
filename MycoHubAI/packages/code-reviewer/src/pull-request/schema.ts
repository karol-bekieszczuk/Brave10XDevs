import { Buffer } from "node:buffer";
import { z } from "zod";
import { codeReviewSeveritySchema } from "../schemas/code-review.js";

export const MAX_PULL_REQUEST_BODY_CHARACTERS = 8_000;
export const MAX_PULL_REQUEST_PATCH_BYTES = 100 * 1024;
export const PULL_REQUEST_BODY_TRUNCATION_MARKER = "\n\n[PR body truncated at 8,000 characters]";

const gitShaSchema = z.string().regex(/^[0-9a-f]{40}$/iu, "Expected a 40-character Git commit SHA.");
const repositoryPathSchema = z.string().trim().min(1).max(500);

function characterCount(value: string): number {
  return Array.from(value).length;
}

export function normalizePullRequestBody(body: string | null | undefined): string {
  if (body === null || body === undefined) {
    return "";
  }

  if (characterCount(body) <= MAX_PULL_REQUEST_BODY_CHARACTERS) {
    return body;
  }

  const retainedCharacters = MAX_PULL_REQUEST_BODY_CHARACTERS - characterCount(PULL_REQUEST_BODY_TRUNCATION_MARKER);
  return `${Array.from(body).slice(0, retainedCharacters).join("")}${PULL_REQUEST_BODY_TRUNCATION_MARKER}`;
}

export const pullRequestChangedFileSchema = z
  .object({
    path: repositoryPathSchema,
    changeType: z.enum(["added", "modified", "deleted", "renamed", "copied", "type-changed", "unmerged", "unknown"]),
    previousPath: repositoryPathSchema.optional(),
    binary: z.boolean().default(false),
    submodule: z.boolean().default(false),
  })
  .strict();

export const pullRequestReviewRequestSchema = z
  .object({
    repository: z
      .string()
      .trim()
      .min(3)
      .max(200)
      .regex(/^[^/\s]+\/[^/\s]+$/u, "Repository must use the owner/name format."),
    pullRequestNumber: z.number().int().positive(),
    baseSha: gitShaSchema,
    headSha: gitShaSchema,
    title: z.string().trim().min(1).max(256),
    body: z.string().nullable().optional().transform(normalizePullRequestBody),
    changedFiles: z.array(pullRequestChangedFileSchema).min(1).max(500),
    patch: z.string().refine((value) => Buffer.byteLength(value, "utf8") <= MAX_PULL_REQUEST_PATCH_BYTES, {
      message: "Patch exceeds the 100 KiB UTF-8 limit.",
    }),
    retry: z.boolean(),
  })
  .strict();

const reviewEvidenceSchema = z
  .object({
    filePath: repositoryPathSchema,
    line: z.number().int().positive().optional(),
    description: z.string().trim().min(1).max(500),
  })
  .strict();

const providerReviewEvidenceSchema = z
  .object({
    filePath: repositoryPathSchema,
    line: z.number().int().positive().nullable(),
    description: z.string().trim().min(1).max(500),
  })
  .strict();

const reviewCriterionSchema = z
  .object({
    score: z.number().int().min(1).max(10),
    rationale: z.string().trim().min(1).max(1_000),
    evidence: z.array(reviewEvidenceSchema).min(1).max(10),
  })
  .strict();

const providerReviewCriterionSchema = z
  .object({
    score: z.number().int().min(1).max(10),
    rationale: z.string().trim().min(1).max(1_000),
    evidence: z.array(providerReviewEvidenceSchema).min(1).max(10),
  })
  .strict();

export const pullRequestReviewFindingSchema = z
  .object({
    severity: codeReviewSeveritySchema,
    filePath: repositoryPathSchema,
    line: z.number().int().positive().optional(),
    message: z.string().trim().min(1).max(1_000),
    suggestion: z.string().trim().min(1).max(1_000).optional(),
  })
  .strict();

const providerPullRequestReviewFindingSchema = z
  .object({
    severity: codeReviewSeveritySchema,
    filePath: repositoryPathSchema,
    line: z.number().int().positive().nullable(),
    message: z.string().trim().min(1).max(1_000),
    suggestion: z.string().trim().min(1).max(1_000).nullable(),
  })
  .strict();

const reviewCriteriaSchema = z
  .object({
    documentation: reviewCriterionSchema,
    testCoverage: reviewCriterionSchema,
    testQuality: reviewCriterionSchema,
  })
  .strict();

const providerReviewCriteriaSchema = z
  .object({
    documentation: providerReviewCriterionSchema,
    testCoverage: providerReviewCriterionSchema,
    testQuality: providerReviewCriterionSchema,
  })
  .strict();

export const pullRequestReviewResultSchema = z
  .object({
    reviewedCommitSha: gitShaSchema,
    criteria: reviewCriteriaSchema,
    findings: z.array(pullRequestReviewFindingSchema).max(20),
  })
  .strict();

export const providerPullRequestReviewResultSchema = z
  .object({
    reviewedCommitSha: gitShaSchema,
    criteria: providerReviewCriteriaSchema,
    findings: z.array(providerPullRequestReviewFindingSchema).max(20),
  })
  .strict();

export type PullRequestChangedFile = z.infer<typeof pullRequestChangedFileSchema>;
export type PullRequestReviewRequest = z.infer<typeof pullRequestReviewRequestSchema>;
export type PullRequestReviewFinding = z.infer<typeof pullRequestReviewFindingSchema>;
export type PullRequestReviewResult = z.infer<typeof pullRequestReviewResultSchema>;

export function normalizeProviderPullRequestReviewResult(
  result: z.infer<typeof providerPullRequestReviewResultSchema>,
): PullRequestReviewResult {
  const normalizeEvidence = (evidence: z.infer<typeof providerReviewEvidenceSchema>) => ({
    filePath: evidence.filePath,
    ...(evidence.line === null ? {} : { line: evidence.line }),
    description: evidence.description,
  });

  return pullRequestReviewResultSchema.parse({
    reviewedCommitSha: result.reviewedCommitSha,
    criteria: Object.fromEntries(
      Object.entries(result.criteria).map(([name, criterion]) => [
        name,
        {
          ...criterion,
          evidence: criterion.evidence.map(normalizeEvidence),
        },
      ]),
    ),
    findings: result.findings.map(({ line, suggestion, ...finding }) => ({
      ...finding,
      ...(line === null ? {} : { line }),
      ...(suggestion === null ? {} : { suggestion }),
    })),
  });
}
