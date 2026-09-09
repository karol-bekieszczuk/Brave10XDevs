import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const environmentSchema = z.object({
  OPENROUTER_API_KEY: z.string().trim().min(1, "OPENROUTER_API_KEY is required"),

  OPENROUTER_MODEL: z.string().trim().min(1).default("openai/gpt-4o"),
});

export type Environment = z.infer<typeof environmentSchema>;

const SYSTEM_PROMPT = `
You are a code reviewer.

Review the provided git diff.

Focus on:
- implementation correctness,
- code quality,
- unnecessary complexity,
- potential bugs,
- security issues.

Explain any problems you find and provide a short final assessment.
`.trim();

export function readEnvironment(environment: NodeJS.ProcessEnv = process.env): Environment {
  return environmentSchema.parse(environment);
}

export async function reviewCode(diff: string, environment: NodeJS.ProcessEnv = process.env): Promise<string> {
  const config = readEnvironment(environment);

  const openrouter = createOpenRouter({
    apiKey: config.OPENROUTER_API_KEY,
  });

  const { text } = await generateText({
    model: openrouter(config.OPENROUTER_MODEL),
    system: SYSTEM_PROMPT,
    prompt: `Review the following diff:\n\n${diff}`,
  });

  return text;
}

async function main(): Promise<void> {
  const diff = process.argv.slice(2).join(" ").trim();

  const review = await reviewCode(diff);

  console.log(review);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
