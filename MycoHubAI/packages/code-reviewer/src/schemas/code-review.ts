import { z } from "zod";

export const codeReviewSeveritySchema = z.enum(["error", "warning", "suggestion"]);

export const codeReviewFindingSchema = z
  .object({
    severity: codeReviewSeveritySchema,
    filePath: z.string().trim().min(1).max(500),
    line: z.number().int().positive().optional(),
    message: z.string().trim().min(1).max(1_000),
    suggestion: z.string().trim().min(1).max(1_000).optional(),
  })
  .strict();

export const codeReviewResultSchema = z
  .object({
    findings: z.array(codeReviewFindingSchema).max(20),
  })
  .strict();

export type CodeReviewSeverity = z.infer<typeof codeReviewSeveritySchema>;
export type CodeReviewFinding = z.infer<typeof codeReviewFindingSchema>;
export type CodeReviewResult = z.infer<typeof codeReviewResultSchema>;
