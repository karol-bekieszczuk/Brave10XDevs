import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const environmentSchema = z.object({
  OPENROUTER_API_KEY: z.string().trim().min(1, "OPENROUTER_API_KEY is required"),

  OPENROUTER_MODEL: z.string().trim().min(1).default("openai/gpt-4o"),
});

export type Environment = z.infer<typeof environmentSchema>;

const SYSTEM_PROMPT = `Jesteś precyzyjnym, konstruktywnym recenzentem kodu oceniającym pull request.
Oceń podany diff w pięciu kryteriach w skali 1-10 (1 = poważne braki, 10 = wzorowo):
poprawność implementacji, idiomatyczność, złożoność, pokrycie testami względem ryzyka, bezpieczeństwo.
Następnie wydaj wiążący werdykt (pass/fail) dla całej zmiany i dołącz krótkie podsumowanie (2-3 zdania)
w Markdown, na podstawie którego autor PR-a będzie mógł działać.`.trim();

export function readEnvironment(environment: NodeJS.ProcessEnv = process.env): Environment {
  return environmentSchema.parse(environment);
}

export async function reviewCode(diff: string, environment: NodeJS.ProcessEnv = process.env): Promise<string> {
  const config = readEnvironment(environment);

  const openrouter = createOpenRouter({
    apiKey: config.OPENROUTER_API_KEY,
  });

  const { text, usage } = await generateText({
    model: openrouter(config.OPENROUTER_MODEL),
    system: SYSTEM_PROMPT,
    prompt: `Review the following diff:\n\n${diff}`,
  });

  console.log(`Tokens: ${usage.inputTokens} input / ${usage.outputTokens} output / ${usage.totalTokens} total`);

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
