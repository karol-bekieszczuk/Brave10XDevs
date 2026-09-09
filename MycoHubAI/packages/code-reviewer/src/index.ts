import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const environmentSchema = z.object({
  OPENROUTER_API_KEY: z.string().trim().min(1, "OPENROUTER_API_KEY is required"),
  OPENROUTER_MODEL: z.string().trim().min(1).default("openai/gpt-4o"),
});

export type Environment = z.infer<typeof environmentSchema>;

export function readEnvironment(environment: NodeJS.ProcessEnv = process.env): Environment {
  return environmentSchema.parse(environment);
}

export async function generateResponse(prompt: string, environment: NodeJS.ProcessEnv = process.env): Promise<string> {
  const config = readEnvironment(environment);
  const openrouter = createOpenRouter({ apiKey: config.OPENROUTER_API_KEY });

  const { text } = await generateText({
    model: openrouter(config.OPENROUTER_MODEL),
    prompt,
  });

  return text;
}

async function main(): Promise<void> {
  const prompt = process.argv.slice(2).join(" ").trim() || "Explain what makes a good code review in one paragraph.";
  console.log(await generateResponse(prompt));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
