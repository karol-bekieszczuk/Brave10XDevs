import { fileURLToPath } from "node:url";
import { generateResponse } from "./generate-response.js";
import { DEFAULT_REVIEW_REQUEST } from "./prompts/code-review.js";

export interface CliDependencies {
  argv?: string[];
  repositoryRoot?: string;
  writeOutput?: (message: string) => void;
  writeError?: (error: unknown) => void;
}

export async function runCli({
  argv = process.argv.slice(2),
  repositoryRoot = process.cwd(),
  writeOutput = console.log,
  writeError = console.error,
}: CliDependencies = {}): Promise<number> {
  const prompt = argv.join(" ").trim() || DEFAULT_REVIEW_REQUEST;

  try {
    const result = await generateResponse(prompt, process.env, repositoryRoot);
    writeOutput(JSON.stringify(result, null, 2));
    return 0;
  } catch (error) {
    writeError(error);
    return 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void runCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
