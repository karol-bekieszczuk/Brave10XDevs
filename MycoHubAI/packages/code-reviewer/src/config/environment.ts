import { z } from "zod";

export const DEFAULT_OPENROUTER_MODEL = "openai/gpt-4o";

export const environmentSchema = z.object({
  OPENROUTER_API_KEY: z
    .string({ error: "OPENROUTER_API_KEY is required" })
    .trim()
    .min(1, { error: "OPENROUTER_API_KEY is required" }),
  OPENROUTER_MODEL: z.string().trim().min(1).default(DEFAULT_OPENROUTER_MODEL),
});

export type Environment = z.infer<typeof environmentSchema>;

export function readEnvironment(environment: Record<string, string | undefined> = process.env): Environment {
  return environmentSchema.parse(environment);
}
