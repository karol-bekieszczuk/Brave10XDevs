import { z } from "zod";

export const diagnosisScopeStatusSchema = z.enum(["in_scope", "missing_context", "mixed_scope", "out_of_scope"]);

export const diagnosisConfidenceBandSchema = z.enum(["low", "medium", "high"]);

export const diagnosisRequestSchema = z.object({
  growLogId: z.string().trim().min(1, "Grow log id is required."),
  question: z.string().trim().min(1, "Question is required.").max(2000, "Question is too long."),
});

export const diagnosisSourceSchema = z.object({
  sourcePath: z.string().min(1),
  sourceHeading: z.string().min(1).nullable(),
});

export const diagnosisResponseSchema = z.object({
  scopeStatus: diagnosisScopeStatusSchema,
  possibleCauses: z.array(z.string().min(1)),
  suggestedActions: z.array(z.string().min(1)),
  confidenceBand: diagnosisConfidenceBandSchema.nullable(),
  uncertainty: z.string().min(1),
  followUpQuestion: z.string().min(1).nullable(),
  sources: z.array(diagnosisSourceSchema),
});

export const diagnosisSuccessSchema = z.object({
  ok: z.literal(true),
  diagnosis: diagnosisResponseSchema,
});

export const diagnosisErrorSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    retryable: z.boolean(),
  }),
});

export const diagnosisApiResponseSchema = z.discriminatedUnion("ok", [diagnosisSuccessSchema, diagnosisErrorSchema]);

export type DiagnosisScopeStatus = z.infer<typeof diagnosisScopeStatusSchema>;
export type DiagnosisRequest = z.infer<typeof diagnosisRequestSchema>;
export type DiagnosisSource = z.infer<typeof diagnosisSourceSchema>;
export type DiagnosisResponse = z.infer<typeof diagnosisResponseSchema>;
export type DiagnosisSuccess = z.infer<typeof diagnosisSuccessSchema>;
export type DiagnosisErrorResponse = z.infer<typeof diagnosisErrorSchema>;
export type DiagnosisApiResponse = z.infer<typeof diagnosisApiResponseSchema>;
